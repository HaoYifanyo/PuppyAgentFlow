---
name: Web Search
type: tool
description: Search google for current events and information
input_schema:
  query: string
output_schema:
  results: array
---

# Implementation
{
  "executor": "python_eval",
  "config": {
    "code": "\ndef execute(inputs):\n    import requests\n    import os\n\n    query = inputs.get(\"query\")\n    api_key = os.getenv(\"SERPAPI_API_KEY\")\n\n    if not api_key:\n        return {\"error\": \"Missing SERPAPI_API_KEY in environment\"}\n\n    url = f\"https://serpapi.com/search.json?q={query}&api_key={api_key}\"\n    response = requests.get(url)\n    data = response.json()\n\n    results = []\n    for item in data.get(\"organic_results\", []):\n        results.append({\n            \"title\": item.get(\"title\"),\n            \"link\": item.get(\"link\")\n        })\n\n    return {\"results\": results[:5]} \n"
  }
}
