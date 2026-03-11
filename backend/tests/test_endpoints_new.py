import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.models.workflow import Workflow, Skill
from app.database import init_db
from beanie import PydanticObjectId

@pytest_asyncio.fixture(autouse=True)
async def db_init():
    await init_db(db_name="test_endpoints_api_db")
    await Workflow.find_all().delete()
    await Skill.find_all().delete()
    yield
    await Workflow.find_all().delete()
    await Skill.find_all().delete()

@pytest.mark.asyncio
async def test_workflow_list_and_delete():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Create a workflow
        workflow_data = {
            "name": "Test Workflow",
            "nodes": [
                {
                    "id": "start-node",
                    "name": "Start",
                    "skill_id": "system:start",
                    "is_start_node": True,
                    "require_approval": False,
                    "config": {}
                }
            ],
            "edges": []
        }
        response = await ac.post("/workflows", json=workflow_data)
        assert response.status_code == 200
        workflow_id = response.json()["_id"]

        # 2. List workflows
        response = await ac.get("/workflows")
        assert response.status_code == 200
        workflows = response.json()
        assert any(w["_id"] == workflow_id for w in workflows)

        # 3. Delete workflow
        response = await ac.delete(f"/workflows/{workflow_id}")
        assert response.status_code == 200
        assert response.json()["message"] == "Workflow deleted"

        # 4. Verify deleted
        response = await ac.get("/workflows")
        workflows = response.json()
        assert not any(w["_id"] == workflow_id for w in workflows)

@pytest.mark.asyncio
async def test_skill_delete():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Create a skill
        skill_data = {
            "name": "Test Skill",
            "type": "tool",
            "description": "A skill for testing",
            "implementation": {"method": "test"},
            "input_schema": {},
            "output_schema": {}
        }
        response = await ac.post("/skills", json=skill_data)
        assert response.status_code == 200
        skill_id = response.json()["_id"]

        # 2. Delete skill
        response = await ac.delete(f"/skills/{skill_id}")
        assert response.status_code == 200
        assert response.json()["message"] == "Skill deleted"

        # 3. Verify deleted (via list_skills)
        response = await ac.get("/skills")
        skills = response.json()
        assert not any(s["_id"] == skill_id for s in skills)
