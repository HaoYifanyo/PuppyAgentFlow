import json
import os
from typing import Any, Dict, Optional

from pydantic import BaseModel
from dotenv import load_dotenv

from app.models.workflow import Node, Skill, Agent
from app.services.llm_client import LLMClient
from app.services.tool_executor import ToolExecutorManager
from app.services.crypto_utils import decrypt_text
import asyncio

load_dotenv()

tool_manager = ToolExecutorManager()


async def _get_llm_client(node: Node, streaming: bool = False) -> LLMClient:
    """
    Build an LLMClient based on the agent referenced by node.agent_id.
    An explicit Puppy Agent with api_key is required; no environment fallback.
    """
    agent_id = getattr(node, "agent_id", None)
    if not agent_id:
        raise RuntimeError("LLM node must have a Puppy Agent assigned. Please select an agent in the node settings.")

    from beanie import PydanticObjectId

    agent = await Agent.get(PydanticObjectId(agent_id))
    if not agent:
        raise RuntimeError(f"Agent not found for id: {agent_id}")

    api_key = decrypt_text(agent.api_key_encrypted)
    if not api_key:
        raise RuntimeError("Agent is missing API key. Please update the Puppy Agent with a valid key.")

    return LLMClient(
        provider=agent.provider,
        model=agent.model_id,
        api_key=api_key,
        base_url=agent.base_url or None,
        streaming=streaming,
    )


async def _get_agent_for_browser_use(node: Node) -> Agent:
    """
    Get the Agent document for browser_use executor.
    Reuses the same Agent retrieval logic as LLM nodes.
    """
    agent_id = getattr(node, "agent_id", None)
    if not agent_id:
        raise RuntimeError("browser_use node must have a Puppy Agent assigned. Please select an agent in the node settings.")

    from beanie import PydanticObjectId

    agent = await Agent.get(PydanticObjectId(agent_id))
    if not agent:
        raise RuntimeError(f"Agent not found for id: {agent_id}")

    api_key = decrypt_text(agent.api_key_encrypted)
    if not api_key:
        raise RuntimeError("Agent is missing API key. Please update the Puppy Agent with a valid key.")

    return agent


async def execute_tool_node(node: Node, inputs: Dict[str, Any], skill: Skill = None) -> Any:
    implementation = getattr(skill, "implementation", {}) if skill else getattr(node, "implementation", {})

    if not isinstance(implementation, dict):
        raise ValueError(f"Tool implementation must be a dictionary. Got: {implementation}")

    # Support both 'executor' and 'executor_type' keys
    executor = implementation.get("executor") or implementation.get("executor_type")
    config = implementation.get("config", {})

    # If no separate config, use the entire implementation as config (minus executor keys)
    if not config:
        config = {k: v for k, v in implementation.items() if k not in ("executor", "executor_type")}

    node_merged_config = getattr(node, "config", {})
    if node_merged_config:
        config.update(node_merged_config)

    if not executor:
        raise ValueError(f"Tool implementation missing 'executor' or 'executor_type': {implementation}")

    # For browser_use executor, pass Agent configuration
    if executor == "browser_use":
        agent = await _get_agent_for_browser_use(node)
        config["agent_config"] = {
            "provider": agent.provider,
            "model_id": agent.model_id,
            "api_key": decrypt_text(agent.api_key_encrypted)
        }

    return tool_manager.execute(executor, config, inputs)


def _extract_query(inputs: Dict[str, Any]) -> str:
    """Extract a query string from inputs for RAG retrieval.

    Priority: keys named prompt/query/input/question/text,
    then first string value found.
    """
    for key in ("prompt", "query", "input", "question", "text"):
        if key in inputs and isinstance(inputs[key], str) and inputs[key].strip():
            return inputs[key].strip()

    for value in inputs.values():
        if isinstance(value, str) and value.strip():
            return value.strip()

    return ""


def _build_rag_context(chunks: list) -> str:
    """Format retrieved chunks into a context block for the system prompt."""
    lines = [
        "## Reference Context\n",
        "The following information was retrieved from the knowledge base. "
        "Use it to inform your response when relevant.\n",
        "---",
    ]
    for chunk in chunks:
        source = chunk.metadata.get("filename", "unknown")
        index = chunk.metadata.get("chunk_index", 0)
        lines.append(f"[Source: {source}, Chunk {index}]")
        lines.append(chunk.text)
        lines.append("")
    lines.append("---")
    return "\n".join(lines)


async def execute_llm_node(node: Node, inputs: Dict[str, Any], skill: Skill = None) -> Any:
    implementation = getattr(skill, "implementation", {}) if skill else getattr(node, "implementation", {})

    if not isinstance(implementation, dict):
        raise ValueError(f"LLM implementation must be a dictionary with 'prompt_template'. Got: {implementation}")

    from app.services.skill_service import SkillFileService
    prompt_template = None
    if skill:
        prompt_template = SkillFileService.load_prompt(skill)

    if not prompt_template:
        prompt_template = implementation.get("prompt_template", "You are an AI assistant. Please process the input.")

    for key, val in inputs.items():
        placeholder = f"{{{{{key}}}}}"
        if placeholder in prompt_template:
            prompt_template = prompt_template.replace(placeholder, str(val))

    system_prompt = prompt_template

    # Apply agent-level system prompt override (prepended)
    agent_id = getattr(node, "agent_id", None)
    if agent_id:
        from app.models.workflow import Agent
        from beanie import PydanticObjectId
        try:
            agent = await Agent.get(PydanticObjectId(agent_id))
            if agent and agent.system_prompt:
                system_prompt = agent.system_prompt + "\n\n" + system_prompt
        except Exception:
            pass

    # --- RAG context injection ---
    kb_id = (getattr(node, "config", None) or {}).get("knowledge_base_id")
    if kb_id:
        query = _extract_query(inputs)
        if query:
            try:
                from app.models.knowledge_base import KnowledgeBase
                from beanie import PydanticObjectId as _ObjId
                kb = await KnowledgeBase.get(_ObjId(kb_id))
                if kb:
                    from app.services.rag_instances import rag_service
                    rag_top_k = (getattr(node, "config", None) or {}).get("rag_top_k", 3)
                    chunks = await rag_service.search(kb, query, top_k=rag_top_k)
                    if chunks:
                        rag_context = _build_rag_context(chunks)
                        system_prompt = rag_context + "\n\n" + system_prompt
            except Exception as e:
                print(f"Warning: RAG retrieval failed for node {node.name}: {e}")

    input_str = json.dumps(inputs, ensure_ascii=False, indent=2)
    user_prompt = f"Additional Input Data:\n{input_str}"

    output_schema = getattr(node, "config", {}).get("output_schema")
    if not output_schema and skill:
        output_schema = getattr(skill, "output_schema", {})
    if not output_schema:
        output_schema = {"result": "string"}

    llm_client = await _get_llm_client(node, streaming=True)
    return await llm_client.generate(system_prompt, user_prompt, output_schema)


async def generate_skill_with_llm(instruction: str) -> Dict[str, Any]:
    """Uses the first available Puppy Agent to generate a skill definition.
    """


    async def _pick_agent() -> Agent:
        for provider in ("gemini", "openai", "anthropic", "custom"):
            agent = await Agent.find_one(Agent.provider == provider)
            if agent is not None:
                return agent
        raise RuntimeError("No Puppy Agent configured. Please create at least one agent before generating skills.")

    agent = await _pick_agent()
    api_key = decrypt_text(agent.api_key_encrypted)
    if not api_key:
        raise RuntimeError("Selected agent for skill generation has no API key configured.")

    llm_client = LLMClient(
        provider=agent.provider,
        model=agent.model_id,
        api_key=api_key,
        base_url=agent.base_url or None,
    )

    system_prompt = """You are a software architect that creates JSON definitions for AI Workflow skills.
Given a user's natural language request to create a node/skill, generate a JSON object representing the skill.

The JSON object MUST follow this exact schema:
{
  "name": "A short, clear name for the skill",
  "type": "Must be either 'llm', 'tool', or 'browser_use'",
  "description": "A 1-2 sentence description of what the skill does",
  "input_schema": { "key_name": "string" },
  "output_schema": { "key_name": "string" },
  "implementation": {
    "prompt_template": "# skill description\n...\n## input data\n{{key_name}}\n"
  }
}

For browser_use type, use this implementation format:
{
  "executor_type": "browser_use",
  "task_template": "Natural language task description with {{variable}} placeholders",
  "max_steps": 20,
  "browser_config": {"headless": false}
}"""
    user_prompt = f"User Request: {instruction}\nGenerate the JSON skill definition:"
    raw_text = await llm_client.generate(system_prompt, user_prompt)

    print(raw_text)
    if isinstance(raw_text, dict):
        skill_data = raw_text
    else:
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.startswith("```"):
            raw_text = raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        skill_data = json.loads(raw_text.strip())

    required_keys = ["name", "type", "description", "implementation"]
    for key in required_keys:
        if key not in skill_data:
            skill_data[key] = f"Generated {key}"
    if "input_schema" not in skill_data:
        skill_data["input_schema"] = {"input": "string"}
    if "output_schema" not in skill_data:
        skill_data["output_schema"] = {"output": "string"}
    return skill_data
