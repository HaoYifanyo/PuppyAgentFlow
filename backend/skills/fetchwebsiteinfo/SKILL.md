---
name: FetchWebsiteInfo
type: tool
description: Fetches website information including title, meta description, links, and basic structure.
input_schema:
  url: string
output_schema:
  title: string
  description: string
  links: array
  status_code: integer
---

# Implementation
{
  "executor": "python_eval",
  "config": {
    "code": "\ndef execute(inputs):\n    import requests\n    from bs4 import BeautifulSoup\n    from urllib.parse import urljoin\n    \n    url = inputs.get(\"url\")\n    if not url:\n        return {\"error\": \"URL is required\"}\n    \n    try:\n        headers = {\n            \"User-Agent\": \"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\"\n        }\n        response = requests.get(url, headers=headers, timeout=10, verify=False)\n        response.raise_for_status()\n        \n        soup = BeautifulSoup(response.text, \"html.parser\")\n        \n        # Extract title\n        title = soup.title.string if soup.title else \"\"\n        \n        # Extract meta description\n        description = \"\"\n        meta_desc = soup.find(\"meta\", attrs={\"name\": \"description\"})\n        if meta_desc:\n            description = meta_desc.get(\"content\", \"\")\n        \n        # Extract links (first 20)\n        links = []\n        for link in soup.find_all(\"a\", href=True)[:20]:\n            href = link.get(\"href\")\n            if href and href.startswith((\"http\", \"/\")):\n                full_url = urljoin(url, href)\n                links.append({\n                    \"text\": link.get_text(strip=True)[:100],\n                    \"href\": full_url\n                })\n        \n        return {\n            \"title\": title,\n            \"description\": description[:500],\n            \"links\": links,\n            \"status_code\": response.status_code\n        }\n    except Exception as e:\n        return {\"error\": str(e)}\n"
  }
}