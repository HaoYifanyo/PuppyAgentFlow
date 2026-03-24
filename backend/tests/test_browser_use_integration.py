import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_browser_use_node_end_to_end():
    """Test complete browser_use node execution with mocked browser-use."""
    from app.services.llm_executor import execute_tool_node

    mock_node = MagicMock()
    mock_node.agent_id = "507f1f77bcf86cd799439011"
    mock_node.config = {}

    mock_skill = MagicMock()
    mock_skill.implementation = {
        "executor_type": "browser_use",
        "task_template": "Search for {{keyword}} jobs in {{location}}",
        "max_steps": 10,
        "browser_config": {"headless": True}
    }

    mock_agent = MagicMock()
    mock_agent.provider = "openai"
    mock_agent.model_id = "gpt-4"
    mock_agent.api_key_encrypted = "encrypted_key"

    # Mock browser-use Agent
    mock_browser_agent = MagicMock()
    mock_browser_result = MagicMock()
    mock_browser_result.final_result.return_value = "Found 5 Python jobs in Beijing"
    mock_browser_agent.run = AsyncMock(return_value=mock_browser_result)

    with patch("app.services.llm_executor.Agent") as MockDBAgent:
        MockDBAgent.get = AsyncMock(return_value=mock_agent)

        with patch("app.services.llm_executor.decrypt_text") as mock_decrypt:
            mock_decrypt.return_value = "decrypted_key"

            with patch("browser_use.Agent", return_value=mock_browser_agent):
                with patch("browser_use.ChatOpenAI") as mock_chat:
                    mock_chat.return_value = MagicMock()

                    result = await execute_tool_node(
                        mock_node,
                        {"keyword": "Python", "location": "Beijing"},
                        mock_skill
                    )

                    assert result["result"] == "Found 5 Python jobs in Beijing"
                    mock_browser_agent.run.assert_called_once()
