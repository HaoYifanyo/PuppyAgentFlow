"""
Tests for team_orchestrator - execution logic with mocked LLM.
"""
import pytest
import pytest_asyncio
from unittest.mock import patch, AsyncMock, MagicMock
from app.models.team import Team, TeamRun, TeamMessage, TeamMember, TeamEdge
from app.models.workflow import Agent
from app.database import init_db
from app.services.team_orchestrator import run_team
from app.services.crypto_utils import encrypt_text


@pytest_asyncio.fixture(autouse=True)
async def db_init():
    await init_db(db_name="test_team_orchestrator_db")
    await Team.find_all().delete()
    await TeamRun.find_all().delete()
    await TeamMessage.find_all().delete()
    await Agent.find({"name": {"$regex": "^TestAgent"}}).delete()
    yield
    await Team.find_all().delete()
    await TeamRun.find_all().delete()
    await TeamMessage.find_all().delete()
    await Agent.find({"name": {"$regex": "^TestAgent"}}).delete()


async def _create_test_agent(name="TestAgent", provider="openai"):
    agent = Agent(
        name=name,
        provider=provider,
        model_id="gpt-4o-mini",
        api_key_encrypted=encrypt_text("fake-api-key"),
    )
    await agent.insert()
    return str(agent.id)


async def _create_simple_team(agent_id: str):
    team = Team(
        name="Test Team",
        members=[
            TeamMember(id="lead", name="Lead", agent_id=agent_id, is_lead=True),
            TeamMember(id="writer", name="Writer", agent_id=agent_id, is_lead=False),
        ],
        edges=[TeamEdge(source="lead", target="writer")],
    )
    await team.insert()
    return team


async def _create_team_no_edges(agent_id: str):
    team = Team(
        name="Independent Team",
        members=[
            TeamMember(id="a", name="Agent A", agent_id=agent_id, is_lead=False),
            TeamMember(id="b", name="Agent B", agent_id=agent_id, is_lead=False),
        ],
        edges=[],
    )
    await team.insert()
    return team


@pytest.mark.asyncio
async def test_run_team_simple_chain():
    """Lead -> Writer chain: Lead assigns task, Writer executes."""
    agent_id = await _create_test_agent()
    team = await _create_simple_team(agent_id)
    run = TeamRun(team_id=str(team.id), user_input="Write a poem", max_rounds=1)
    await run.insert()

    with patch("app.services.team_orchestrator.LLMClient") as MockLLM:
        mock_instance = MagicMock()
        mock_instance.generate = AsyncMock()
        # Lead outputs task assignment JSON
        mock_instance.generate.side_effect = [
            '{"assignments": [{"target": "writer", "task": "Write a short poem about spring"}], "summary": "Task delegated to writer"}',
            "Spring has come, flowers bloom bright...",
        ]
        MockLLM.return_value = mock_instance

        await run_team(str(team.id), str(run.id))

    # Verify run completed
    run = await TeamRun.get(run.id)
    assert run.status == "completed"
    assert run.current_round == 1

    # Verify messages
    messages = await TeamMessage.find(
        TeamMessage.team_run_id == str(run.id)
    ).sort("+timestamp").to_list()

    message_types = [(m.sender, m.message_type) for m in messages]
    # Lead produces work_result + task_assignment
    assert ("lead", "task_assignment") in message_types
    assert ("lead", "work_result") in message_types
    # Writer produces work_result
    assert ("writer", "work_result") in message_types


@pytest.mark.asyncio
async def test_run_team_no_edges():
    """No edges: all agents run independently in parallel."""
    agent_id = await _create_test_agent()
    team = await _create_team_no_edges(agent_id)
    run = TeamRun(team_id=str(team.id), user_input="Do two things", max_rounds=1)
    await run.insert()

    with patch("app.services.team_orchestrator.LLMClient") as MockLLM:
        mock_instance = MagicMock()
        mock_instance.generate = AsyncMock(side_effect=[
            "Result from Agent A",
            "Result from Agent B",
        ])
        MockLLM.return_value = mock_instance

        await run_team(str(team.id), str(run.id))

    run = await TeamRun.get(run.id)
    assert run.status == "completed"

    messages = await TeamMessage.find(
        TeamMessage.team_run_id == str(run.id)
    ).to_list()

    work_results = [m for m in messages if m.message_type == "work_result"]
    assert len(work_results) == 2
    senders = {m.sender for m in work_results}
    assert senders == {"a", "b"}


@pytest.mark.asyncio
async def test_run_team_multi_round():
    """Two rounds of execution."""
    agent_id = await _create_test_agent()
    team = await _create_simple_team(agent_id)
    run = TeamRun(team_id=str(team.id), user_input="Improve iteratively", max_rounds=2)
    await run.insert()

    call_count = 0

    async def mock_generate(system_prompt, user_prompt):
        nonlocal call_count
        call_count += 1
        if call_count <= 2:
            # Round 1
            if "Lead" in system_prompt:
                return '{"assignments": [{"target": "writer", "task": "Round 1 task"}], "summary": "Delegated"}'
            return "Round 1 writer output"
        else:
            # Round 2
            if "Lead" in system_prompt:
                return '{"assignments": [{"target": "writer", "task": "Round 2 task"}], "summary": "Delegated"}'
            return "Round 2 writer output"

    with patch("app.services.team_orchestrator.LLMClient") as MockLLM:
        mock_instance = MagicMock()
        mock_instance.generate = mock_generate
        MockLLM.return_value = mock_instance

        await run_team(str(team.id), str(run.id))

    run = await TeamRun.get(run.id)
    assert run.status == "completed"
    assert run.current_round == 2

    messages = await TeamMessage.find(
        TeamMessage.team_run_id == str(run.id)
    ).to_list()

    round_1_msgs = [m for m in messages if m.round == 1]
    round_2_msgs = [m for m in messages if m.round == 2]
    assert len(round_1_msgs) > 0
    assert len(round_2_msgs) > 0


@pytest.mark.asyncio
async def test_run_team_handles_llm_error():
    """LLM error should be caught and recorded as coordination message."""
    agent_id = await _create_test_agent()
    team = await _create_simple_team(agent_id)
    run = TeamRun(team_id=str(team.id), user_input="This will fail", max_rounds=1)
    await run.insert()

    with patch("app.services.team_orchestrator.LLMClient") as MockLLM:
        mock_instance = MagicMock()
        mock_instance.generate = AsyncMock(side_effect=Exception("API rate limit"))
        MockLLM.return_value = mock_instance

        await run_team(str(team.id), str(run.id))

    # Run should still complete (errors are caught per-agent)
    run = await TeamRun.get(run.id)
    assert run.status == "completed"

    messages = await TeamMessage.find(
        TeamMessage.team_run_id == str(run.id)
    ).to_list()

    error_msgs = [m for m in messages if m.message_type == "coordination" and "Error" in m.content]
    assert len(error_msgs) >= 1


@pytest.mark.asyncio
async def test_run_team_lead_no_assignments():
    """Lead responds with plain text (no task assignments)."""
    agent_id = await _create_test_agent()
    team = await _create_simple_team(agent_id)
    run = TeamRun(team_id=str(team.id), user_input="Just do it", max_rounds=1)
    await run.insert()

    with patch("app.services.team_orchestrator.LLMClient") as MockLLM:
        mock_instance = MagicMock()
        mock_instance.generate = AsyncMock(side_effect=[
            "I'll handle this directly.",  # Lead - no JSON
            "Writer output here.",  # Writer - gets edge from lead
        ])
        MockLLM.return_value = mock_instance

        await run_team(str(team.id), str(run.id))

    run = await TeamRun.get(run.id)
    assert run.status == "completed"

    messages = await TeamMessage.find(
        TeamMessage.team_run_id == str(run.id)
    ).to_list()

    work_results = [m for m in messages if m.message_type == "work_result"]
    assert len(work_results) == 2
    task_assignments = [m for m in messages if m.message_type == "task_assignment"]
    assert len(task_assignments) == 0


@pytest.mark.asyncio
async def test_run_team_parallel_agents():
    """Three agents with no dependencies run in parallel."""
    agent_id = await _create_test_agent()
    team = Team(
        name="Parallel Team",
        members=[
            TeamMember(id="a", name="A", agent_id=agent_id),
            TeamMember(id="b", name="B", agent_id=agent_id),
            TeamMember(id="c", name="C", agent_id=agent_id),
        ],
        edges=[],
    )
    await team.insert()
    run = TeamRun(team_id=str(team.id), user_input="All do something", max_rounds=1)
    await run.insert()

    with patch("app.services.team_orchestrator.LLMClient") as MockLLM:
        mock_instance = MagicMock()
        mock_instance.generate = AsyncMock(side_effect=[
            "A's result", "B's result", "C's result",
        ])
        MockLLM.return_value = mock_instance

        await run_team(str(team.id), str(run.id))

    run = await TeamRun.get(run.id)
    assert run.status == "completed"

    messages = await TeamMessage.find(
        TeamMessage.team_run_id == str(run.id)
    ).to_list()

    work_results = [m for m in messages if m.message_type == "work_result"]
    assert len(work_results) == 3


@pytest.mark.asyncio
async def test_run_team_diamond_dependency():
    """
    Diamond graph: A -> B, A -> C, B -> D, C -> D
    A runs first, then B and C in parallel, then D.
    """
    agent_id = await _create_test_agent()
    team = Team(
        name="Diamond Team",
        members=[
            TeamMember(id="a", name="A", agent_id=agent_id),
            TeamMember(id="b", name="B", agent_id=agent_id),
            TeamMember(id="c", name="C", agent_id=agent_id),
            TeamMember(id="d", name="D", agent_id=agent_id),
        ],
        edges=[
            TeamEdge(source="a", target="b"),
            TeamEdge(source="a", target="c"),
            TeamEdge(source="b", target="d"),
            TeamEdge(source="c", target="d"),
        ],
    )
    await team.insert()
    run = TeamRun(team_id=str(team.id), user_input="Diamond task", max_rounds=1)
    await run.insert()

    with patch("app.services.team_orchestrator.LLMClient") as MockLLM:
        mock_instance = MagicMock()
        mock_instance.generate = AsyncMock(side_effect=[
            "A output", "B output", "C output", "D output",
        ])
        MockLLM.return_value = mock_instance

        await run_team(str(team.id), str(run.id))

    run = await TeamRun.get(run.id)
    assert run.status == "completed"

    messages = await TeamMessage.find(
        TeamMessage.team_run_id == str(run.id)
    ).to_list()

    work_results = [m for m in messages if m.message_type == "work_result"]
    assert len(work_results) == 4
