import os
import yaml
from typing import Optional, Dict, Any
from app.models.workflow import Skill

class SkillFileService:
    @staticmethod
    def save(skill: Skill) -> str:
        """
        Saves a skill to the local file system using a Markdown file with YAML frontmatter.
        """
        path = skill.get_path()

        # Ensure directory exists
        os.makedirs(os.path.dirname(path), exist_ok=True)

        # Prepare frontmatter
        frontmatter = {
            "name": skill.name,
            "type": skill.type,
            "description": skill.description
        }

        # Include schemas if they are present and non-empty
        if skill.input_schema:
            frontmatter["input_schema"] = skill.input_schema
        if skill.output_schema:
            frontmatter["output_schema"] = skill.output_schema

        yaml_str = yaml.dump(frontmatter, allow_unicode=True, default_flow_style=False, sort_keys=False)

        # Extract implementation text
        impl_text = ""
        if isinstance(skill.implementation, dict):
            if skill.type == "llm":
                impl_text = skill.implementation.get("prompt_template", "")
            else:
                # for tool nodes, the execution logic might still reside in DB or a python script.
                # For now, we'll store the config dict.
                import json
                impl_text = json.dumps(skill.implementation, indent=2, ensure_ascii=False)
        else:
             impl_text = str(skill.implementation)

        # Build file content
        file_content = f"---\n{yaml_str}---\n\n# Implementation\n{impl_text}\n"

        with open(path, "w", encoding="utf-8") as f:
            f.write(file_content)

        return path

    @staticmethod
    def load_prompt(skill: Skill) -> Optional[str]:
        """
        Loads the prompt/implementation logic from the SKILL.md file.
        Returns None if file does not exist or cannot be parsed.
        """
        path = skill.get_path()

        if not os.path.exists(path):
            return None

        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()

            # extract everything after the second '---'
            parts = content.split("---", 2)
            if len(parts) >= 3:
                body = parts[2].strip()
                # Strip the '# Implementation' header if it's the first line
                lines = body.split('\n')
                if lines and lines[0].strip().startswith('# Implementation'):
                    body = '\n'.join(lines[1:]).strip()
                return body
            return None
        except Exception as e:
            print(f"Error loading prompt from {path}: {e}")
            return None
