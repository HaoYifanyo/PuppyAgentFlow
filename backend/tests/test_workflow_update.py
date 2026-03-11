import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.models.workflow import Workflow
from app.database import init_db
from beanie import PydanticObjectId

@pytest_asyncio.fixture(autouse=True)
async def db_init():
    await init_db(db_name="test_workflow_update_api_db")
    await Workflow.find_all().delete()
    yield
    await Workflow.find_all().delete()

@pytest.mark.asyncio
async def test_update_workflow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Create a workflow
        workflow_data = {
            "name": "Original Name",
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

        # 2. Update the workflow
        updated_data = {
            "_id": workflow_id,
            "name": "Updated Name",
            "nodes": [
                {
                    "id": "start-node",
                    "name": "Start",
                    "skill_id": "system:start",
                    "is_start_node": True,
                    "require_approval": False,
                    "config": {}
                },
                {
                    "id": "node1",
                    "name": "Node 1",
                    "skill_id": "dummy_skill"
                }
            ],
            "edges": []
        }

        response = await ac.put(f"/workflows/{workflow_id}", json=updated_data)
        assert response.status_code == 200
        result = response.json()
        assert result["name"] == "Updated Name"
        assert len(result["nodes"]) == 2

        # 3. Verify the update
        response = await ac.get("/workflows")
        workflows = response.json()
        updated_wf = next(w for w in workflows if w["_id"] == workflow_id)
        assert updated_wf["name"] == "Updated Name"
        assert len(updated_wf["nodes"]) == 2
