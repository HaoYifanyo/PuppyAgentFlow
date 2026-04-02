---
name: ExportFile
type: tool
description: Export text or structured data to a local file (txt/md/json/csv) under a safe export directory.
input_schema:
  file_name: string
  format: string
  content: string
output_schema:
  success: boolean
  file_path: string
  file_name: string
  bytes_written: integer
  error: string
---
# Implementation
{"executor": "python_eval"}
