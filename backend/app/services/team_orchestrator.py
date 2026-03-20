"""
Team orchestrator. Isolated from langgraph_engine and workflow helpers.
Executes team runs using message-log based communication.
"""
import asyncio
import json
from typing import Any, Dict, List, Optional, Set

from app.models.team import Team, TeamRun, TeamMessage, TeamMember
from app.models.workflow import Agent, Skill
from app.services.llm_client import LLMClient
from app.services.crypto_utils import decrypt_text
from beanie import PydanticObjectId


async def _get_llm_client(agent_id: str) -> LLMClient:
    agent = await Agent.get(PydanticObjectId(agent_id))
    if not agent:
        raise RuntimeError(f"Agent not found: {agent_id}")
    api_key = decrypt_text(agent.api_key_encrypted)
    if not api_key:
        raise RuntimeError(f"Agent {agent.name} has no API key")
    return LLMClient(
        provider=agent.provider,
        model=agent.model_id,
        api_key=api_key,
        base_url=agent.base_url or None,
    )


def _get_inbound_sources(member: TeamMember, edges: list, members: list[TeamMember]) -> List[str]:
    source_ids = []
    for edge in edges:
        if edge.target == member.id:
            source_ids.append(edge.source)
    return source_ids


def _has_no_inbound_edges(member: TeamMember, edges: list) -> bool:
    for edge in edges:
        if edge.target == member.id:
            return False
    return True


def _build_agent_context(
    member: TeamMember,
    team: Team,
    run: TeamRun,
    all_messages: List[TeamMessage],
    current_round: int,
) -> str:
    parts = []

    # Role
    role = member.role_name or member.name
    parts.append(f"You are: {member.name} (role: {role})")
    if member.is_lead:
        parts.append("You are the LEAD of this team.")

    # Team structure
    member_names = {m.id: m.name for m in team.members}
    parts.append(f"Team members: {', '.join(f'{m.name} (id: {m.id})' for m in team.members)}")

    # Edges (information flow)
    if team.edges:
        edge_desc = ", ".join(
            f"{member_names.get(e.source, e.source)} -> {member_names.get(e.target, e.target)}"
            for e in team.edges
        )
        parts.append(f"Information flow: {edge_desc}")

    # Current round
    parts.append(f"Current round: {current_round} of {run.max_rounds}")

    # Task assignments targeting this agent (all rounds)
    assignments = [
        m for m in all_messages
        if m.message_type == "task_assignment" and m.target == member.id
    ]
    if assignments:
        parts.append("\n=== Tasks assigned to you ===")
        for a in assignments:
            sender_name = member_names.get(a.sender, a.sender)
            parts.append(f"[Round {a.round}] {sender_name}: {a.content}")

    # Work results from inbound edge sources (all rounds)
    inbound_sources = _get_inbound_sources(member, team.edges, team.members)
    if inbound_sources:
        source_results = [
            m for m in all_messages
            if m.message_type == "work_result" and m.sender in inbound_sources
        ]
        if source_results:
            parts.append("\n=== Results from upstream agents ===")
            for r in source_results:
                sender_name = member_names.get(r.sender, r.sender)
                parts.append(f"[Round {r.round}] {sender_name}: {r.content}")

    # User input (entry points only)
    if _has_no_inbound_edges(member, team.edges):
        parts.append(f"\n=== User request ===\n{run.user_input}")

    # Multi-round: previous round summaries
    prev_round_msgs = [m for m in all_messages if m.round < current_round]
    if prev_round_msgs:
        parts.append(f"\n=== Previous rounds summary (rounds 1-{current_round - 1}) ===")
        for m in prev_round_msgs:
            if m.message_type == "user_input":
                continue  # already shown above
            sender_name = member_names.get(m.sender, m.sender)
            parts.append(f"[Round {m.round}] {m.message_type} from {sender_name}: {m.content}")

    return "\n".join(parts)


def _build_system_prompt(member: TeamMember) -> str:
    parts = [
        f"You are {member.name}, a member of an AI agent team.",
    ]
    if member.role_name:
        parts.append(f"Your role: {member.role_name}")
    if member.is_lead:
        parts.append(
            "You are the LEAD. Your job is to coordinate the team. "
            "You may assign tasks to other members. "
            "To assign a task, respond with a JSON object:\n"
            '{"assignments": [{"target": "<member_id>", "task": "<task description>"}], "summary": "<your overall output>"}\n'
            "If you don't need to assign tasks, just respond with your output directly."
        )
    return "\n".join(parts)


def _parse_lead_output(output: str, team_members: List[TeamMember]) -> tuple[str, List[dict]]:
    member_ids = {m.id for m in team_members}
    try:
        data = json.loads(output)
        if isinstance(data, dict) and "assignments" in data:
            assignments = [
                a for a in data["assignments"]
                if isinstance(a, dict) and a.get("target") in member_ids
            ]
            summary = data.get("summary", "")
            return summary, assignments
    except (json.JSONDecodeError, TypeError):
        pass
    return output, []


async def _execute_agent(
    member: TeamMember,
    team: Team,
    run: TeamRun,
    current_round: int,
) -> dict:
    agent_id = member.agent_id
    llm_client = await _get_llm_client(agent_id)

    all_messages = await TeamMessage.find(
        TeamMessage.team_run_id == str(run.id)
    ).to_list()

    system_prompt = _build_system_prompt(member)
    user_prompt = _build_agent_context(member, team, run, all_messages, current_round)

    output = await llm_client.generate(system_prompt, user_prompt)
    if isinstance(output, dict):
        output = json.dumps(output, ensure_ascii=False)

    targets = []
    if member.is_lead:
        summary, assignments = _parse_lead_output(output, team.members)
        output = summary if summary else output
        for a in assignments:
            await TeamMessage(
                team_run_id=str(run.id),
                round=current_round,
                sender=member.id,
                message_type="task_assignment",
                content=a["task"],
                target=a["target"],
            ).insert()
            targets.append(a["target"])

    await TeamMessage(
        team_run_id=str(run.id),
        round=current_round,
        sender=member.id,
        message_type="work_result",
        content=output,
    ).insert()

    return {"member_id": member.id, "targets": targets}


def _find_ready_members(
    team: Team,
    completed: Set[str],
    targeted: Set[str],
) -> List[TeamMember]:
    ready = []
    for m in team.members:
        if m.id in completed:
            continue
        # Entry points (no inbound edges): ready if not completed
        if _has_no_inbound_edges(m, team.edges):
            ready.append(m)
            continue
        # Targeted by task_assignment: ready if not completed
        if m.id in targeted:
            ready.append(m)
            continue
        # All inbound sources completed: ready
        inbound = _get_inbound_sources(m, team.edges, team.members)
        if inbound and all(s in completed for s in inbound):
            ready.append(m)
    return ready


async def run_team(team_id: str, run_id: str):
    team = await Team.get(PydanticObjectId(team_id))
    run = await TeamRun.get(PydanticObjectId(run_id))
    if not team or not run:
        return

    run.status = "running"
    await run.save()

    try:
        for round_num in range(1, run.max_rounds + 1):
            run.current_round = round_num
            await run.save()

            completed: Set[str] = set()
            targeted: Set[str] = set()

            ready = _find_ready_members(team, completed, targeted)

            while len(completed) < len(team.members):
                if not ready:
                    break

                results = await asyncio.gather(
                    *[_execute_agent(m, team, run, round_num) for m in ready],
                    return_exceptions=True,
                )

                for m, result in zip(ready, results):
                    if isinstance(result, Exception):
                        await TeamMessage(
                            team_run_id=str(run.id),
                            round=round_num,
                            sender=m.id,
                            message_type="coordination",
                            content=f"Error: {str(result)}",
                        ).insert()
                    completed.add(m.id)
                    if isinstance(result, dict):
                        for t in result.get("targets", []):
                            targeted.add(t)

                ready = _find_ready_members(team, completed, targeted)

        run.status = "completed"
        await run.save()
    except Exception as e:
        run.status = "error"
        await run.save()
        await TeamMessage(
            team_run_id=str(run.id),
            round=run.current_round,
            sender="system",
            message_type="coordination",
            content=f"Execution error: {str(e)}",
        ).insert()
