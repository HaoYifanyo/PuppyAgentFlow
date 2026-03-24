import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_get_agent_for_browser_use_missing_agent_id():
    """Test that missing agent_id raises RuntimeError."""
    from app.services.llm_executor import _get_agent_for_browser_use

    mock_node = MagicMock()
    mock_node.agent_id = None

    with pytest.raises(RuntimeError, match="must have a Puppy Agent assigned"):
        await _get_agent_for_browser_use(mock_node)


@pytest.mark.asyncio
async def test_get_agent_for_browser_use_agent_not_found():
    """Test that non-existent agent raises RuntimeError."""
    from app.services.llm_executor import _get_agent_for_browser_use

    mock_node = MagicMock()
    mock_node.agent_id = "507f1f77bcf86cd799439011"

    with patch("app.services.llm_executor.Agent") as MockAgent:
        MockAgent.get = AsyncMock(return_value=None)

        with pytest.raises(RuntimeError, match="Agent not found"):
            await _get_agent_for_browser_use(mock_node)


def test_execute_browser_use_missing_executor_type():
    """Test that missing executor_type raises ValueError."""
    from app.services.tool_executor import ToolExecutorManager

    manager = ToolExecutorManager()
    with pytest.raises(ValueError, match="Unknown tool executor type"):
        manager.execute("nonexistent_type", {}, {})


def test_execute_browser_use_task_template_interpolation():
    """Test that task template is correctly interpolated with inputs."""
    from app.services.tool_executor import ToolExecutorManager

    manager = ToolExecutorManager()
    config = {
        "executor_type": "browser_use",
        "task_template": "Search for {{keyword}} in {{location}}",
        "agent_config": {
            "provider": "openai",
            "model_id": "gpt-4",
            "api_key": "test_key"
        }
    }
    inputs = {"keyword": "Python", "location": "Beijing"}

    # Mock browser-use Agent
    mock_result = MagicMock()
    mock_result.final_result.return_value = "Found 5 Python jobs in Beijing"
    mock_agent = MagicMock()
    mock_agent.run = AsyncMock(return_value=mock_result)

    with patch("browser_use.Agent", return_value=mock_agent) as mock_agent_class:
        with patch("browser_use.ChatOpenAI") as mock_chat:
            mock_chat.return_value = MagicMock()
            
            result = manager.execute("browser_use", config, inputs)

            # Verify the task was interpolated
            call_kwargs = mock_agent_class.call_args[1]
            assert "Python" in call_kwargs["task"]
            assert "Beijing" in call_kwargs["task"]
            assert result["result"] == "Found 5 Python jobs in Beijing"
