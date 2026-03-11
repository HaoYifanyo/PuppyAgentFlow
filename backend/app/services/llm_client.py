import os
import json
from google import genai
from typing import List, Dict, Any, Optional

class LLMClient:
    """
    A customized LLM client based on Gemini
    """
    def __init__(self, model: str = None, api_key: str = None):
        self.model = model or os.getenv("LLM_MODEL_ID", "gemini-2.5-flash")
        api_key = api_key or os.getenv("LLM_API_KEY")

        if not api_key:
            raise ValueError("LLM_API_KEY must be provided or defined in the .env file.")

        self.client = genai.Client(api_key=api_key)

    def generate(self, system_prompt: str, user_prompt: str, response_schema: Optional[Dict] = None) -> Any:
        """
        Call the large language model to generate content, optionally enforcing JSON schema.
        """
        full_prompt = f"[System]\n{system_prompt}\n\n[User]\n{user_prompt}"
        
        if response_schema:
            schema_str = json.dumps(response_schema, ensure_ascii=False, indent=2)
            schema_instruction = f"""
You MUST output your response as a valid JSON object strictly matching the following schema.
Do not include any markdown formatting like ```json or ```, just output the raw JSON string.
Schema:
{schema_str}
"""
            full_prompt += f"\n{schema_instruction}"

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=full_prompt,
            )
            
            text = response.text.strip()
            
            if response_schema:
                # Clean up JSON markdown block if model ignored instruction
                if text.startswith("```json"): text = text[7:]
                if text.startswith("```"): text = text[3:]
                if text.endswith("```"): text = text[:-3]
                text = text.strip()
                
                try:
                    return json.loads(text)
                except json.JSONDecodeError as e:
                    raise ValueError(f"LLM did not return valid JSON. Raw output: {text}") from e
            else:
                return text
                
        except Exception as e:
            raise RuntimeError(f"LLM execution failed: {str(e)}") from e
