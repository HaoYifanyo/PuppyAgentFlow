def execute(inputs):
    import requests
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin

    url = inputs.get('url')
    if not url:
        return {'error': 'URL is required'}

    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10, verify=False)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # Remove script and style
        for tag in soup(['script', 'style']):
            tag.decompose()

        # Extract title
        title = ''
        og_title = soup.find('meta', property='og:title')
        if og_title:
            title = og_title.get('content', '')
        if not title and soup.title:
            title = soup.title.string or ''

        # Extract description
        description = ''
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc:
            description = meta_desc.get('content', '')
        if not description:
            og_desc = soup.find('meta', property='og:description')
            if og_desc:
                description = og_desc.get('content', '')

        # Extract page text (main content)
        main = soup.find('main') or soup.find('article') or soup.find('body')
        text_summary = main.get_text(separator=' ', strip=True)[:2000] if main else ''

        # Extract unique links with meaningful text
        seen = set()
        content_links = []
        nav_links = []

        for link in soup.find_all('a', href=True):
            href = link.get('href', '')
            if not href.startswith(('http', '/')):
                continue
            full_url = urljoin(url, href)
            if full_url in seen:
                continue
            link_text = link.get_text(strip=True)
            if len(link_text) < 10:
                continue
            seen.add(full_url)

            entry = {'text': link_text[:100], 'href': full_url}
            if any(seg in href for seg in ['/tyo/', '/job/', '/post/', '/article/', '/product/', '/item/', '/detail/']):
                content_links.append(entry)
            else:
                nav_links.append(entry)

        links = (content_links + nav_links)[:30]

        return {
            'title': title[:200],
            'description': description[:500],
            'links': links,
            'text_summary': text_summary,
            'status_code': response.status_code
        }
    except Exception as e:
        return {'error': str(e)}
