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
{
  "executor": "python_eval",
  "config": {
    "code": "\ndef execute(inputs):\n    import os\n    import json\n    import csv\n    import io\n    import re\n\n    file_name = (inputs.get('file_name') or '').strip()\n    fmt = (inputs.get('format') or 'txt').strip().lower()\n    content = inputs.get('content', '')\n    output_subdir = (inputs.get('output_subdir') or '').strip()\n    overwrite = str(inputs.get('overwrite', 'false')).lower() == 'true'\n\n    if not file_name:\n        return {'success': False, 'file_path': '', 'file_name': '', 'bytes_written': 0, 'error': 'file_name is required'}\n\n    allowed_formats = {'txt', 'md', 'json', 'csv'}\n    if fmt not in allowed_formats:\n        return {'success': False, 'file_path': '', 'file_name': '', 'bytes_written': 0, 'error': f'unsupported format: {fmt}. allowed: txt, md, json, csv'}\n\n    file_name = os.path.basename(file_name)\n    file_name = re.sub(r'[<>:\"/\\\\|?*]', '_', file_name)\n    if not file_name:\n        return {'success': False, 'file_path': '', 'file_name': '', 'bytes_written': 0, 'error': 'invalid file_name after sanitization'}\n\n    if not file_name.lower().endswith(f'.{fmt}'):\n        file_name = f'{file_name}.{fmt}'\n\n    export_root = os.path.join(os.getcwd(), 'exports')\n    os.makedirs(export_root, exist_ok=True)\n\n    target_dir = export_root\n    if output_subdir:\n        safe_subdir = re.sub(r'[<>:\"|?*]', '_', output_subdir).strip('. ').strip()\n        if safe_subdir:\n            target_dir = os.path.join(export_root, safe_subdir)\n            os.makedirs(target_dir, exist_ok=True)\n\n    file_path = os.path.abspath(os.path.join(target_dir, file_name))\n\n    if os.path.commonpath([file_path, os.path.abspath(export_root)]) != os.path.abspath(export_root):\n        return {'success': False, 'file_path': '', 'file_name': '', 'bytes_written': 0, 'error': 'unsafe output path'}\n\n    if not overwrite and os.path.exists(file_path):\n        return {'success': False, 'file_path': '', 'file_name': file_name, 'bytes_written': 0, 'error': 'file already exists; set overwrite=true to replace'}\n\n    MAX_BYTES = 10 * 1024 * 1024\n\n    try:\n        if fmt in ('txt', 'md'):\n            payload = str(content)\n\n        elif fmt == 'json':\n            if isinstance(content, (dict, list)):\n                payload = json.dumps(content, ensure_ascii=False, indent=2)\n            else:\n                try:\n                    obj = json.loads(str(content))\n                    payload = json.dumps(obj, ensure_ascii=False, indent=2)\n                except Exception:\n                    payload = str(content)\n\n        elif fmt == 'csv':\n            if isinstance(content, list) and content and isinstance(content[0], dict):\n                fieldnames = list(content[0].keys())\n                buff = io.StringIO()\n                writer = csv.DictWriter(buff, fieldnames=fieldnames)\n                writer.writeheader()\n                writer.writerows(content)\n                payload = buff.getvalue()\n            else:\n                payload = str(content)\n\n        if len(payload.encode('utf-8')) > MAX_BYTES:\n            return {'success': False, 'file_path': '', 'file_name': file_name, 'bytes_written': 0, 'error': 'content exceeds 10MB limit'}\n\n        write_kwargs = {'newline': ''} if fmt == 'csv' else {}\n        with open(file_path, 'w', encoding='utf-8', **write_kwargs) as f:\n            f.write(payload)\n\n        size = os.path.getsize(file_path)\n        return {\n            'success': True,\n            'file_path': file_path,\n            'file_name': file_name,\n            'bytes_written': size,\n            'error': ''\n        }\n\n    except Exception as e:\n        return {'success': False, 'file_path': '', 'file_name': file_name, 'bytes_written': 0, 'error': str(e)}\n"
  }
}
