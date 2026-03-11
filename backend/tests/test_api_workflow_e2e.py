import sys
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.models.workflow import Workflow, WorkflowRun, Skill
from app.database import init_db

@pytest_asyncio.fixture(autouse=True)
async def db_init():
    # Use a separate test database
    await init_db(db_name="test_api_db_smoke")
    # Clear existing data to ensure a clean state
    await Workflow.find_all().delete()
    await WorkflowRun.find_all().delete()
    await Skill.find_all().delete()
    yield
    # Cleanup
    await Workflow.find_all().delete()
    await WorkflowRun.find_all().delete()
    await Skill.find_all().delete()

@pytest.mark.asyncio
async def test_end_to_end_workflow_execution():
    """
    Smoke Test: End-to-end API test verifying workflow creation, execution pause (human-in-the-loop),
    resuming, and final status fetching.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:

        # 0. Setup a mock skill so the executor doesn't fail
        skill_data = {
            "name": "Test Skill",
            "type": "tool",
            "implementation": {
                "executor": "python_eval",
                "config": {"code": "def execute(inputs): return {'done': True}"}
            }
        }
        res = await ac.post("/skills", json=skill_data)
        assert res.status_code == 200
        skill_id = res.json()["_id"]

        # 1. Create a Workflow
        workflow_data = {
            "name": "API Test Workflow",
            "nodes": [
                {"id": "start", "name": "Start", "skill_id": "start-node", "is_start_node": True},
                {"id": "node_1", "name": "Node 1", "skill_id": skill_id, "require_approval": True},
                {"id": "node_2", "name": "Node 2", "skill_id": skill_id, "require_approval": False}
            ],
            "edges": [
                {"source": "start", "target": "node_1", "data_mapping": {"test_key": "test_key"}},
                {"source": "node_1", "target": "node_2", "data_mapping": {}}
            ]
        }

        res = await ac.post("/workflows", json=workflow_data)
        assert res.status_code == 200, f"Failed to create workflow: {res.text}"
        wf = res.json()
        wf_id = wf.get("_id") or wf.get("id")
        assert wf_id is not None

        # 2. Start a run
        res = await ac.post(f"/workflows/{wf_id}/run", json={"test_key": "test_val"})
        assert res.status_code == 200, f"Failed to start run: {res.text}"
        run = res.json()
        run_id = run.get("_id") or run.get("id")

        # Verify it paused at the first node (node_1, because start completes immediately)
        assert run["status"] == "paused", f"Run should be paused, got: {run['status']}"
        assert run["node_runs"]["start"]["status"] == "completed"
        assert run["node_runs"]["node_1"]["status"] == "paused"

        # 3. Resume the run
        resume_data = {
            "action": "edit",
            "modified_outputs": {"result": "approved"}
        }
        res = await ac.post(f"/runs/{run_id}/nodes/node_1/resume", json=resume_data)
        assert res.status_code == 200, f"Failed to resume run: {res.text}"
        resumed_run = res.json()

        # Verify it completed after resuming
        assert resumed_run["status"] == "completed"

        # 4. Fetch the final run state
        res = await ac.get(f"/runs/{run_id}")
        assert res.status_code == 200, f"Failed to fetch run: {res.text}"
        final_run = res.json()
        assert final_run["status"] == "completed"
