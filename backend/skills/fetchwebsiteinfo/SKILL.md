---
name: FetchWebsiteInfo
type: tool
description: Fetches website information including title, description, links, and page text summary.
input_schema:
  url: string
output_schema:
  title: string
  description: string
  links: array
  text_summary: string
  status_code: integer
---

# Implementation
{
  "executor": "python_eval",
  "config": {
    "code": "\ndef execute(inputs):\n    import requests\n    from bs4 import BeautifulSoup\n    from urllib.parse import urljoin\n    \n    url = inputs.get('url')\n    if not url:\n        return {'error': 'URL is required'}\n    \n    try:\n        headers = {\n            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'\n        }\n        response = requests.get(url, headers=headers, timeout=10, verify=False)\n        response.raise_for_status()\n        \n        soup = BeautifulSoup(response.text, 'html.parser')\n        \n        # Remove script and style\n        for tag in soup(['script', 'style']):\n            tag.decompose()\n        \n        # Extract title\n        title = ''\n        og_title = soup.find('meta', property='og:title')\n        if og_title:\n            title = og_title.get('content', '')\n        if not title and soup.title:\n            title = soup.title.string or ''\n        \n        # Extract description\n        description = ''\n        meta_desc = soup.find('meta', attrs={'name': 'description'})\n        if meta_desc:\n            description = meta_desc.get('content', '')\n        if not description:\n            og_desc = soup.find('meta', property='og:description')\n            if og_desc:\n                description = og_desc.get('content', '')\n        \n        # Extract page text (main content)\n        main = soup.find('main') or soup.find('article') or soup.find('body')\n        text_summary = main.get_text(separator=' ', strip=True)[:2000] if main else ''\n        \n        # Extract unique links with meaningful text\n        seen = set()\n        content_links = []  # likely content/detail pages\n        nav_links = []  # navigation links\n        \n        for link in soup.find_all('a', href=True):\n            href = link.get('href', '')\n            if not href.startswith(('http', '/')):\n                continue\n            full_url = urljoin(url, href)\n            if full_url in seen:\n                continue\n            link_text = link.get_text(strip=True)\n            if len(link_text) < 10:\n                continue\n            seen.add(full_url)\n            \n            entry = {'text': link_text[:100], 'href': full_url}\n            # Heuristic: links with longer paths or containing common detail patterns\n            if any(seg in href for seg in ['/tyo/', '/job/', '/post/', '/article/', '/product/', '/item/', '/detail/']):\n                content_links.append(entry)\n            else:\n                nav_links.append(entry)\n        \n        # Combine: content links first, then nav links\n        links = (content_links + nav_links)[:30]\n        \n        return {\n            'title': title[:200],\n            'description': description[:500],\n            'links': links,\n            'text_summary': text_summary,\n            'status_code': response.status_code\n        }\n    except Exception as e:\n        return {'error': str(e)}\n"
  }
}