import requests
import json
from typing import Dict, Any

class ToolExecutorManager:
    """
    A tool executor responsible for managing and executing tools based on implementation config.
    """
    def __init__(self):
        self.executors = {
            "http_request": self._execute_http_request,
            "python_eval": self._execute_python_eval
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
