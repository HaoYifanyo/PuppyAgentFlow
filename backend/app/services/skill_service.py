import os
import yaml
import json
from typing import Optional, Dict, Any, List
from app.models.workflow import Skill

class SkillFileService:
    @staticmethod
    def load_all_from_disk(skills_dir: str = None) -> List[Dict[str, Any]]:
        """
        Loads all skills from the skills directory by reading SKILL.md files.
        Returns list of skill data dicts (not Skill objects, since Beanie may not be initialized).
        """
        if skills_dir is None:
            skills_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'skills')
        
        skills = []
        if not os.path.exists(skills_dir):
            return skills
        
        for folder_name in os.listdir(skills_dir):
            folder_path = os.path.join(skills_dir, folder_name)
            skill_md_path = os.path.join(folder_path, 'SKILL.md')
            
            if os.path.isdir(folder_path) and os.path.exists(skill_md_path):
                skill_data = SkillFileService.load_skill_data(skill_md_path)
                if skill_data:
                    skills.append(skill_data)
        
        return skills

    @staticmethod
    def _parse_implementation(content: str) -> str:
        """Extract implementation text from SKILL.md content."""
        parts = content.split("---", 2)
        if len(parts) >= 3:
            body = parts[2].strip()
            lines = body.split('\n')
            if lines and lines[0].strip().startswith('# Implementation'):
                body = '\n'.join(lines[1:]).strip()
            return body
        return ""

    @staticmethod
    def load_skill_data(path: str) -> Optional[Dict[str, Any]]:
        """
        Loads skill data from a SKILL.md file as a dict.
        """
        if not os.path.exists(path):
            return None
        
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            
            # Split by '---' to get frontmatter
            parts = content.split("---", 2)
            if len(parts) < 3:
                return None
            
            # Parse YAML frontmatter
            frontmatter = yaml.safe_load(parts[1])
            skill_type = frontmatter.get('type', 'tool')
            
            # Parse implementation (reuse logic)
            impl_text = SkillFileService._parse_implementation(content)
            
            # Try to parse as JSON first
            implementation = {}
            if impl_text:
                try:
                    implementation = json.loads(impl_text)
                except json.JSONDecodeError:
                    # If not JSON, treat as prompt template
                    implementation = {"prompt_template": impl_text}

            # Auto-load execute.py for python_eval skills that have no embedded code
            if implementation.get("executor") == "python_eval":
                config = implementation.setdefault("config", {})
                if not config.get("code"):
                    skill_dir = os.path.dirname(path)
                    py_path = os.path.join(skill_dir, "execute.py")
                    if os.path.exists(py_path):
                        with open(py_path, "r", encoding="utf-8") as pf:
                            config["code"] = pf.read()

            return {
                "name": frontmatter.get('name', ''),
                "type": skill_type,
                "description": frontmatter.get('description', ''),
                "input_schema": frontmatter.get('input_schema', {}),
                "output_schema": frontmatter.get('output_schema', {}),
                "implementation": implementation
            }
        except Exception as e:
            import traceback
            print(f"Error loading skill from {path}: {e}")
            traceback.print_exc()
            return None

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

        # Extract implementation text; for python_eval, write code to execute.py
        impl_text = ""
        if isinstance(skill.implementation, dict):
            if skill.type == "llm":
                impl_text = skill.implementation.get("prompt_template", "")
            elif skill.implementation.get("executor") == "python_eval":
                code = skill.implementation.get("config", {}).get("code", "")
                if code:
                    py_path = os.path.join(os.path.dirname(path), "execute.py")
                    with open(py_path, "w", encoding="utf-8") as pf:
                        pf.write(code)
                impl_text = json.dumps({"executor": "python_eval"}, ensure_ascii=False)
            else:
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
        Loads the prompt/implementation text from the SKILL.md file.
        """
        path = skill.get_path()

        if not os.path.exists(path):
            return None

        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            return SkillFileService._parse_implementation(content)
        except Exception as e:
            print(f"Error loading prompt from {path}: {e}")
            return None
