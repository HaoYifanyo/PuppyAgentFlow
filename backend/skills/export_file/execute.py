def execute(inputs):
    import os
    import json
    import csv
    import io
    import re

    file_name = (inputs.get('file_name') or '').strip()
    fmt = (inputs.get('format') or 'txt').strip().lower()
    content = inputs.get('content', '')
    output_subdir = (inputs.get('output_subdir') or '').strip()
    overwrite = str(inputs.get('overwrite', 'false')).lower() == 'true'

    if not file_name:
        return {'success': False, 'file_path': '', 'file_name': '', 'bytes_written': 0, 'error': 'file_name is required'}

    allowed_formats = {'txt', 'md', 'json', 'csv'}
    if fmt not in allowed_formats:
        return {'success': False, 'file_path': '', 'file_name': '', 'bytes_written': 0, 'error': f'unsupported format: {fmt}. allowed: txt, md, json, csv'}

    file_name = os.path.basename(file_name)
    file_name = re.sub(r'[<>:"/\\|?*]', '_', file_name)
    if not file_name:
        return {'success': False, 'file_path': '', 'file_name': '', 'bytes_written': 0, 'error': 'invalid file_name after sanitization'}

    if not file_name.lower().endswith(f'.{fmt}'):
        file_name = f'{file_name}.{fmt}'

    export_root = os.path.join(os.getcwd(), 'exports')
    os.makedirs(export_root, exist_ok=True)

    target_dir = export_root
    if output_subdir:
        safe_subdir = re.sub(r'[<>:"|?*]', '_', output_subdir).strip('. ').strip()
        if safe_subdir:
            target_dir = os.path.join(export_root, safe_subdir)
            os.makedirs(target_dir, exist_ok=True)

    file_path = os.path.abspath(os.path.join(target_dir, file_name))

    if os.path.commonpath([file_path, os.path.abspath(export_root)]) != os.path.abspath(export_root):
        return {'success': False, 'file_path': '', 'file_name': '', 'bytes_written': 0, 'error': 'unsafe output path'}

    if not overwrite and os.path.exists(file_path):
        return {'success': False, 'file_path': '', 'file_name': file_name, 'bytes_written': 0, 'error': 'file already exists; set overwrite=true to replace'}

    MAX_BYTES = 10 * 1024 * 1024

    try:
        if fmt in ('txt', 'md'):
            payload = str(content)

        elif fmt == 'json':
            if isinstance(content, (dict, list)):
                payload = json.dumps(content, ensure_ascii=False, indent=2)
            else:
                try:
                    obj = json.loads(str(content))
                    payload = json.dumps(obj, ensure_ascii=False, indent=2)
                except Exception:
                    payload = str(content)

        elif fmt == 'csv':
            if isinstance(content, list) and content and isinstance(content[0], dict):
                fieldnames = list(content[0].keys())
                buff = io.StringIO()
                writer = csv.DictWriter(buff, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(content)
                payload = buff.getvalue()
            else:
                payload = str(content)

        if len(payload.encode('utf-8')) > MAX_BYTES:
            return {'success': False, 'file_path': '', 'file_name': file_name, 'bytes_written': 0, 'error': 'content exceeds 10MB limit'}

        write_kwargs = {'newline': ''} if fmt == 'csv' else {}
        with open(file_path, 'w', encoding='utf-8', **write_kwargs) as f:
            f.write(payload)

        size = os.path.getsize(file_path)
        return {
            'success': True,
            'file_path': file_path,
            'file_name': file_name,
            'bytes_written': size,
            'error': ''
        }

    except Exception as e:
        return {'success': False, 'file_path': '', 'file_name': file_name, 'bytes_written': 0, 'error': str(e)}
