import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.services.embedding_service import EmbeddingService


@pytest.fixture
def service():
    return EmbeddingService()


def _make_mock_agent(provider="openai", model_id="text-embedding-3-small", api_key_encrypted="encrypted_key", base_url=None):
    agent = MagicMock()
    agent.provider = provider
    agent.model_id = model_id
    agent.api_key_encrypted = api_key_encrypted
    agent.base_url = base_url
    return agent


class TestEmbeddingService:
    @pytest.mark.asyncio
    @patch("app.services.embedding_service.decrypt_text", return_value="sk-test-key")
    @patch("app.services.embedding_service._build_embeddings_model")
    async def test_embed_texts(self, mock_build, mock_decrypt, service):
        mock_model = MagicMock()
        mock_model.aembed_documents = AsyncMock(return_value=[[0.1, 0.2], [0.3, 0.4]])
        mock_build.return_value = mock_model

        agent = _make_mock_agent()
        result = await service.embed_texts(["hello", "world"], agent)

        assert result == [[0.1, 0.2], [0.3, 0.4]]
        mock_build.assert_called_once_with("openai", "text-embedding-3-small", "sk-test-key", None)

    @pytest.mark.asyncio
    @patch("app.services.embedding_service.decrypt_text", return_value="sk-test-key")
    @patch("app.services.embedding_service._build_embeddings_model")
    async def test_embed_query(self, mock_build, mock_decrypt, service):
        mock_model = MagicMock()
        mock_model.aembed_query = AsyncMock(return_value=[0.5, 0.6])
        mock_build.return_value = mock_model

        agent = _make_mock_agent()
        result = await service.embed_query("hello", agent)

        assert result == [0.5, 0.6]

    @pytest.mark.asyncio
    @patch("app.services.embedding_service.decrypt_text", return_value=None)
    async def test_missing_api_key_raises(self, mock_decrypt, service):
        agent = _make_mock_agent(api_key_encrypted=None)
        with pytest.raises(ValueError, match="API key"):
            await service.embed_texts(["hello"], agent)

    @pytest.mark.asyncio
    @patch("app.services.embedding_service.decrypt_text", return_value="key")
    async def test_unsupported_provider_raises(self, mock_decrypt, service):
        agent = _make_mock_agent(provider="anthropic")
        with pytest.raises(ValueError, match="not supported"):
            await service.embed_texts(["hello"], agent)
