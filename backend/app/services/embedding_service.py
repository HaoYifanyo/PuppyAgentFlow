from typing import Optional
from app.services.crypto_utils import decrypt_text


def _build_embeddings_model(provider: str, model: str, api_key: str, base_url: Optional[str]):
    """Build a LangChain Embeddings instance based on provider."""
    if provider == "openai":
        from langchain_openai import OpenAIEmbeddings
        kwargs = {"model": model, "api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        return OpenAIEmbeddings(**kwargs)

    elif provider == "gemini":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        return GoogleGenerativeAIEmbeddings(model=model, google_api_key=api_key)

    elif provider in ("openrouter", "custom"):
        from langchain_openai import OpenAIEmbeddings
        kwargs = {"model": model, "api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        return OpenAIEmbeddings(**kwargs)

    else:
        raise ValueError(
            f"Embedding provider '{provider}' is not supported. "
            "Use openai, gemini, openrouter, or custom."
        )


class EmbeddingService:
    async def embed_texts(self, texts: list[str], agent) -> list[list[float]]:
        """Batch embed texts using the agent's provider + model + key."""
        api_key = decrypt_text(agent.api_key_encrypted)
        if not api_key:
            raise ValueError("Agent API key is missing. Please configure it in the agent settings.")

        model = _build_embeddings_model(agent.provider, agent.model_id, api_key, agent.base_url)
        return await model.aembed_documents(texts)

    async def embed_query(self, query: str, agent) -> list[float]:
        """Embed a single query string."""
        api_key = decrypt_text(agent.api_key_encrypted)
        if not api_key:
            raise ValueError("Agent API key is missing. Please configure it in the agent settings.")

        model = _build_embeddings_model(agent.provider, agent.model_id, api_key, agent.base_url)
        return await model.aembed_query(query)
