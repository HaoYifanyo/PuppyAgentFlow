def execute(inputs):
    import requests
    import os

    query = inputs.get("query")
    api_key = os.getenv("SERPAPI_API_KEY")

    if not api_key:
        return {"error": "Missing SERPAPI_API_KEY in environment"}

    url = f"https://serpapi.com/search.json?q={query}&api_key={api_key}"
    response = requests.get(url)
    data = response.json()

    results = []
    for item in data.get("organic_results", []):
        results.append({
            "title": item.get("title"),
            "link": item.get("link")
        })

    return {"results": results[:5]}
