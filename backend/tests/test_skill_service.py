import os
import pytest
import sys
import pytest_asyncio

# Add the parent directory of 'app' to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.skill_service import SkillFileService
from app.models.workflow import Skill
from app.database import init_db

from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest_asyncio.fixture(autouse=True)
async def db_init():
    await init_db(db_name="test_skills_service_db")
    await Skill.find_all().delete()
    yield
    await Skill.find_all().delete()

@pytest.mark.asyncio
async def test_save_skill_to_disk():
    skill = Skill(name="Test Skill IO", type="llm", implementation={"prompt_template": "Hello {{name}}"})

    path = skill.get_path()
    if os.path.exists(path):
        os.remove(path)

    SkillFileService.save(skill)

    assert os.path.exists(path)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
        assert "name: Test Skill IO" in content
        assert "type: llm" in content
        assert "Hello {{name}}" in content

    loaded_prompt = SkillFileService.load_prompt(skill)
    assert "Hello {{name}}" in loaded_prompt

    if os.path.exists(path):
        os.remove(path)

@pytest.mark.asyncio
async def test_get_skills():
    # 1. Create a mock skill in the database using Beanie
    test_skill = Skill(
        name="Test Skill",
        type="tool",
        description="A skill for testing",
        implementation={"executor": "test_function"},
        input_schema={"type": "object"},
        output_schema={"type": "object"}
    )
    await test_skill.insert()

    # 2. Use httpx AsyncClient to call GET /skills
    # ASGITransport is used to call the FastAPI app directly without a real network
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/skills")

    # 3. Assertions
    assert response.status_code == 200
    skills = response.json()
    assert isinstance(skills, list)
    assert len(skills) >= 1

    # Check if our created skill is in the returned list
    skill_names = [s["name"] for s in skills]
    assert "Test Skill" in skill_names

    # Verify the details of the returned skill
    found_skill = next(s for s in skills if s["name"] == "Test Skill")
    assert found_skill["type"] == "tool"
    assert found_skill["description"] == "A skill for testing"
    assert found_skill["implementation"] == {"executor": "test_function"}

def test_skill_slug_generation():
    skill = Skill(name="Image Generator", type="llm", implementation={})
    assert skill.get_slug() == "image_generator"

def test_skill_path_generation():
    skill = Skill(name="Image Generator", type="llm", implementation={})
    path = skill.get_path()
    # Use backslashes or normalize for Windows as per plan
    assert "skills\\image_generator\\SKILL.md" in path or "skills/image_generator/SKILL.md" in path.replace("\\", "/")
