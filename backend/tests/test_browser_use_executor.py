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
