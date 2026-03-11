import pytest
from unittest.mock import patch, MagicMock
from app.services.tool_executor import ToolExecutorManager
from app.services.llm_executor import execute_llm_node, execute_tool_node, real_executor_callback
from app.models.workflow import Node, Skill

@pytest.fixture
def tool_manager():
    return ToolExecutorManager()

def test_python_eval_executor(tool_manager):
    config = {
        "code": "def execute(inputs):\n    return {'result': inputs['a'] + inputs['b']}"
    }
    inputs = {"a": 10, "b": 20}
    result = tool_manager.execute("python_eval", config, inputs)
    assert result == {"result": 30}

@patch('app.services.tool_executor.requests.request')
def test_http_request_executor(mock_request, tool_manager):
    # Setup mock response
    mock_response = MagicMock()
    mock_response.json.return_value = {"status": "success"}
    mock_request.return_value = mock_response

    config = {
        "method": "POST",
        "url": "https://api.example.com/users/{{user_id}}",
        "headers": {"Authorization": "Bearer {{token}}"}
    }
    inputs = {"user_id": "123", "token": "abc"}

    result = tool_manager.execute("http_request", config, inputs)

    # Assert requests.request was called correctly
    mock_request.assert_called_once_with(
        method="POST",
        url="https://api.example.com/users/123",
        headers={"Authorization": "Bearer abc"},
        json={"user_id": "123", "token": "abc"},
        timeout=10
    )
    assert result == {"status": "success"}

class MockSkill:
    def __init__(self, name, type, implementation):
        self.name = name
        self.type = type
        self.implementation = implementation

    def get_slug(self) -> str:
        return self.name.lower().replace(" ", "_").replace("-", "_")

    def get_path(self) -> str:
        import os
        base_dir = os.path.join("backend", "skills")
        return os.path.join(base_dir, self.get_slug(), "SKILL.md")

@patch('app.services.llm_executor.llm_client.generate')
def test_execute_llm_node(mock_generate):
    mock_generate.return_value = {"translated": "你好"}

    node = Node(
        id="node1",
        name="Translate Node",
        skill_id="skill1",
        config={"output_schema": {"translated": "string"}}
    )

    skill = MockSkill(
        name="Translate",
        type="llm",
        implementation={
            "prompt_template": "Translate to Chinese: {{text}}"
        }
    )
    inputs = {"text": "Hello"}

    result = execute_llm_node(node, inputs, skill)

    # Check if prompt formatting worked
    called_system_prompt = mock_generate.call_args[0][0]
    assert "Translate to Chinese: Hello" in called_system_prompt
    assert result == {"translated": "你好"}

@patch('app.services.llm_executor.tool_manager.execute')
def test_execute_tool_node_routing(mock_tool_execute):
    mock_tool_execute.return_value = {"done": True}

    node = Node(
        id="node2",
        name="Tool Node",
        skill_id="skill2"
    )

    skill = MockSkill(
        name="Tool",
        type="tool",
        implementation={
            "executor": "python_eval",
            "config": {"code": "def execute(inputs): pass"}
        }
    )

    inputs = {"foo": "bar"}

    result = execute_tool_node(node, inputs, skill)

    mock_tool_execute.assert_called_once_with("python_eval", {"code": "def execute(inputs): pass"}, {"foo": "bar"})
    assert result == {"done": True}

@patch('app.services.llm_executor.execute_tool_node')
@patch('app.services.llm_executor.execute_llm_node')
def test_real_executor_callback_routing(mock_llm, mock_tool):
    node = Node(id="1", name="A", skill_id="1")

    skill_tool = MockSkill(
        name="A",
        type="tool",
        implementation={"executor": "http_request"}
    )

    real_executor_callback(node, {}, skill_tool)
    mock_tool.assert_called_once()
    mock_llm.assert_not_called()

    mock_tool.reset_mock()

    skill_llm = MockSkill(
        name="B",
        type="llm",
        implementation={"prompt_template": "Hello"}
    )
    real_executor_callback(node, {}, skill_llm)
    mock_llm.assert_called_once()
    mock_tool.assert_not_called()