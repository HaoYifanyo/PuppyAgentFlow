import json
from typing import Any, Dict, Optional
from langchain_core.messages import SystemMessage, HumanMessage


def _build_langchain_model(
    provider: str,
    model: str,
    api_key: Optional[str],
    base_url: Optional[str],
    streaming: bool = False,
):
    """Instantiate the appropriate LangChain chat model based on provider.

    All providers require an explicit api_key from Agent configuration.
    """
    if not api_key:
        raise ValueError("api_key is required for all providers. Please configure it in the Puppy Agent.")

    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        if not model:
            raise ValueError("model_id is required for gemini provider")
        return ChatGoogleGenerativeAI(
            model=model, google_api_key=api_key, streaming=streaming
        )

    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        if not model:
            raise ValueError("model_id is required for openai provider")
        kwargs = {"model": model, "api_key": api_key, "streaming": streaming}
        if base_url:
            kwargs["base_url"] = base_url
        return ChatOpenAI(**kwargs)

    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        if not model:
            raise ValueError("model_id is required for anthropic provider")
        return ChatAnthropic(model=model, api_key=api_key, streaming=streaming)

    elif provider == "openrouter":
        from langchain_openai import ChatOpenAI
        if not model:
            raise ValueError("model_id is required for openrouter provider")
        kwargs = {"model": model, "api_key": api_key, "streaming": streaming}
        kwargs["base_url"] = base_url or "https://openrouter.ai/api/v1"
        return ChatOpenAI(**kwargs)

    elif provider == "custom":
        # OpenAI-compatible endpoint
        from langchain_openai import ChatOpenAI
        if not model:
            raise ValueError("model_id is required for custom provider")
        kwargs = {"model": model, "api_key": api_key, "streaming": streaming}
        if base_url:
            kwargs["base_url"] = base_url
        return ChatOpenAI(**kwargs)

    else:
        raise ValueError(f"Unsupported provider: {provider}")


class LLMClient:
    """
    A unified LLM client supporting multiple providers via LangChain.
    Does not use LangChain memory or chain abstractions.
    """

    def __init__(
        self,
        provider: str = "gemini",
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        streaming: bool = False,
    ):
        self._chat_model = _build_langchain_model(
            provider, model, api_key, base_url, streaming=streaming
        )

    async def generate(self, system_prompt: str, user_prompt: str, response_schema: Optional[Dict] = None) -> Any:
        """
        Call the LLM with a system + user prompt.
        Optionally instructs the model to return JSON matching response_schema.
        """
        if response_schema:
            schema_str = json.dumps(response_schema, ensure_ascii=False, indent=2)
            schema_instruction = (
                f"\nYou MUST output your response as a valid JSON object strictly matching the following schema.\n"
                f"Do not include any markdown formatting like ```json or ```, just output the raw JSON string.\n"
                f"Schema:\n{schema_str}"
            )
            user_prompt = user_prompt + schema_instruction

        messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]

        try:
            response = await self._chat_model.ainvoke(messages)
            text = response.content.strip()

            if response_schema:
                if text.startswith("```json"):
                    text = text[7:]
                if text.startswith("```"):
                    text = text[3:]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()
                try:
                    return json.loads(text)
                except json.JSONDecodeError as e:
                    raise ValueError(f"LLM did not return valid JSON. Raw output: {text}") from e
            else:
                return text

        except Exception as e:
            raise RuntimeError(f"LLM execution failed: {str(e)}") from e
