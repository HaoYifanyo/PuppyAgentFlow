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
{"executor": "python_eval"}