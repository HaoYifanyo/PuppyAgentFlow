import json
from typing import Any, Dict
from app.models.workflow import Node, Skill
import os
from pydantic import BaseModel
from dotenv import load_dotenv

from app.services.llm_client import LLMClient
from app.services.tool_executor import ToolExecutorManager

load_dotenv()

llm_client = LLMClient()
tool_manager = ToolExecutorManager()

async def execute_tool_node(node: Node, inputs: Dict[str, Any], skill: Skill = None) -> Any:
    implementation = getattr(skill, "implementation", {}) if skill else getattr(node, "implementation", {})

    if not isinstance(implementation, dict):
        raise ValueError(f"Tool implementation must be a dictionary with 'executor' and 'config'. Got: {implementation}")

    executor = implementation.get("executor")
    config = implementation.get("config", {})

    # merge with node.config
    node_merged_config = getattr(node, "config", {})
    if node_merged_config:
        config.update(node_merged_config)

    if not executor:
        raise ValueError(f"Tool implementation missing 'executor': {implementation}")

    # TODO: check if tool_manager.execute can be async, then use `await tool_manager.execute(...)`
    return tool_manager.execute(executor, config, inputs)

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
    input_str = json.dumps(inputs, ensure_ascii=False, indent=2)
    user_prompt = f"Additional Input Data:\n{input_str}"

    output_schema = getattr(node, "config", {}).get("output_schema")
    if not output_schema and skill:
        output_schema = getattr(skill, "output_schema", {})
    if not output_schema:
         output_schema = {"result": "string"}

    # TODO: check if llm_client.generate can be async
    return llm_client.generate(system_prompt, user_prompt, output_schema)

def real_executor_callback(node: Node, inputs: Dict[str, Any], skill: Skill = None) -> Any:
    # Deprecated with LangGraph refactor
    pass

def generate_skill_with_llm(instruction: str) -> Dict[str, Any]:
    system_prompt = """You are a software architect that creates JSON definitions for AI Workflow skills.
Given a user's natural language request to create a node/skill, generate a JSON object representing the skill.

The JSON object MUST follow this exact schema:
{
  "name": "A short, clear name for the skill",
  "type": "Must be either 'llm' or 'tool'",
  "description": "A 1-2 sentence description of what the skill does",
  "input_schema": { "key_name": "string" },
  "output_schema": { "key_name": "string" },
  "implementation": {
    "prompt_template": "# skill description\n...\n## input data\n{{key_name}}\n"
  }
}"""
    user_prompt = f"User Request: {instruction}\nGenerate the JSON skill definition:"
    raw_text = llm_client.generate(system_prompt, user_prompt)

    print(raw_text)
    if isinstance(raw_text, dict):
        skill_data = raw_text
    else:
        if raw_text.startswith("```json"): raw_text = raw_text[7:]
        if raw_text.startswith("```"): raw_text = raw_text[3:]
        if raw_text.endswith("```"): raw_text = raw_text[:-3]
        skill_data = json.loads(raw_text.strip())

    required_keys = ["name", "type", "description", "implementation"]
    for key in required_keys:
        if key not in skill_data:
            skill_data[key] = f"Generated {key}"
    if "input_schema" not in skill_data: skill_data["input_schema"] = {"input": "string"}
    if "output_schema" not in skill_data: skill_data["output_schema"] = {"output": "string"}
    return skill_data