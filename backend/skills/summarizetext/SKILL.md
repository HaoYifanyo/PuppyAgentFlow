---
name: SummarizeText
type: llm
description: Summarizes a given text into a single concise sentence, capturing its
  main idea.
input_schema:
  text: string
output_schema:
  summary: string
---

# Implementation
# skill description
You are an expert summarizer. Summarize the following text into one single, concise sentence.

## input data
{{text}}

