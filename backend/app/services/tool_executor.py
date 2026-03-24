import requests
import json
import asyncio
from typing import Dict, Any

class ToolExecutorManager:
    """
    A tool executor responsible for managing and executing tools based on implementation config.
    """
    def __init__(self):
        self.executors = {
            "http_request": self._execute_http_request,
            "python_eval": self._execute_python_eval,
            "browser_use": self._execute_browser_use
        }

    def execute(self, executor_type: str, config: Dict[str, Any], inputs: Dict[str, Any]) -> Any:
        """
        Execute a tool node based on its executor type.
        """
        executor_func = self.executors.get(executor_type)
        if not executor_func:
            raise ValueError(f"Unknown tool executor type: {executor_type}")
            
        return executor_func(config, inputs)

    def _execute_http_request(self, config: Dict[str, Any], inputs: Dict[str, Any]) -> Any:
        """
        Execute a generic HTTP request tool.
        """
        url_template = config.get("url", "")
        method = config.get("method", "GET").upper()
        headers_template = config.get("headers", {})
        
        # Simple string replacement for inputs in URL and Headers
        url = url_template
        headers = {}
        
        for key, val in inputs.items():
            str_val = str(val)
            url = url.replace(f"{{{{{key}}}}}", str_val)
            
        for h_key, h_val in headers_template.items():
            for key, val in inputs.items():
                h_val = h_val.replace(f"{{{{{key}}}}}", str(val))
            headers[h_key] = h_val
            
        # Extract payload for POST/PUT requests
        # We assume the inputs dictionary itself should be sent as JSON body if it's a POST/PUT request
        # and no specific body config was provided
        payload = None
        if method in ["POST", "PUT", "PATCH"]:
            payload = inputs
            
        # Add basic try-except for the HTTP request
        try:
            response = requests.request(method=method, url=url, headers=headers, json=payload, timeout=10)
            response.raise_for_status()
            
            # Try to return JSON if possible, else text
            try:
                return response.json()
            except ValueError:
                return {"text_response": response.text}
                
        except Exception as e:
             raise RuntimeError(f"HTTP Request failed: {str(e)}") from e

    def _execute_python_eval(self, config: Dict[str, Any], inputs: Dict[str, Any]) -> Any:
        """
        Execute a dynamic Python script tool.
        """
        code = config.get("code", "")
        if not code:
             raise ValueError("Python eval tool requires 'code' in config")
             
        # Create a restricted local scope for the exec command
        local_scope = {}
        
        try:
            # Execute the code defining the 'execute' function
            exec(code, {}, local_scope)
            
            if 'execute' not in local_scope:
                raise ValueError("Python code must define an 'execute(inputs)' function")
                
            # Call the execute function with the inputs
            result = local_scope['execute'](inputs)
            return result
            
        except Exception as e:
            raise RuntimeError(f"Python eval execution failed: {str(e)}") from e

    def _execute_browser_use(self, config: Dict[str, Any], inputs: Dict[str, Any]) -> Any:
        """
        Execute browser-use agent with task template interpolation.
        """
        # Task template interpolation
        task_template = config.get("task_template", "")
        task = task_template
        for key, val in inputs.items():
            task = task.replace(f"{{{{{key}}}}}", str(val))

        # Browser configuration
        browser_config = config.get("browser_config", {})
        headless = browser_config.get("headless", False)
        max_steps = config.get("max_steps", 20)

        # Build LLM from Agent configuration (sync wrapper for async)
        async def _build_and_run():
            from browser_use import Agent

            # Get Agent configuration from config (passed by execute_tool_node)
            agent_config = config.get("agent_config", {})
            provider = agent_config.get("provider")
            model_id = agent_config.get("model_id")
            api_key = agent_config.get("api_key")

            if not provider or not model_id or not api_key:
                raise ValueError("browser_use requires agent_config with provider, model_id, and api_key")

            # Build LLM based on provider
            llm = self._build_llm_for_browser_use(provider, model_id, api_key)

            # Create and run agent
            agent = Agent(
                task=task,
                llm=llm,
                max_steps=max_steps,
            )

            result = await agent.run()
            return {"result": result.final_result()}

        # Run async function
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If we're already in an async context, we need to handle this differently
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(asyncio.run, _build_and_run())
                    return future.result()
            else:
                return asyncio.run(_build_and_run())
        except Exception as e:
            raise RuntimeError(f"browser_use execution failed: {str(e)}") from e

    def _build_llm_for_browser_use(self, provider: str, model_id: str, api_key: str):
        """Build LLM instance for browser-use based on provider."""
        if provider == "openai":
            from browser_use import ChatOpenAI
            return ChatOpenAI(model=model_id, api_key=api_key)
        elif provider == "anthropic":
            from browser_use import ChatAnthropic
            return ChatAnthropic(model=model_id, api_key=api_key)
        elif provider == "gemini":
            from browser_use import ChatGoogle
            return ChatGoogle(model=model_id, api_key=api_key)
        else:
            raise ValueError(f"Unsupported provider for browser_use: {provider}")
