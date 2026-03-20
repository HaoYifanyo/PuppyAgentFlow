import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from unittest.mock import patch, AsyncMock
from app.main import app
from app.models.team import Team, TeamRun, TeamMessage
from app.database import init_db


@pytest_asyncio.fixture(autouse=True)
async def db_init():
    await init_db(db_name="test_team_api_db")
    await Team.find_all().delete()
    await TeamRun.find_all().delete()
    await TeamMessage.find_all().delete()
    yield
    await Team.find_all().delete()
    await TeamRun.find_all().delete()
    await TeamMessage.find_all().delete()


def _make_team_payload(name="Test Team"):
    return {
        "name": name,
        "members": [
            {"id": "lead", "name": "Lead", "agent_id": "agent-1", "is_lead": True},
            {"id": "writer", "name": "Writer", "agent_id": "agent-2", "is_lead": False},
            {"id": "translator", "name": "Translator", "agent_id": "agent-3", "is_lead": False},
        ],
        "edges": [
            {"source": "lead", "target": "writer"},
            {"source": "writer", "target": "translator"},
        ],
    }


@pytest.mark.asyncio
async def test_create_team():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/teams", json=_make_team_payload())
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test Team"
        assert len(data["members"]) == 3
        assert len(data["edges"]) == 2
        assert data["members"][0]["is_lead"] is True
        assert "_id" in data


@pytest.mark.asyncio
async def test_list_teams():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/teams", json=_make_team_payload("Team A"))
        await ac.post("/teams", json=_make_team_payload("Team B"))
        resp = await ac.get("/teams")
        assert resp.status_code == 200
        teams = resp.json()
        assert len(teams) == 2
        names = {t["name"] for t in teams}
        assert names == {"Team A", "Team B"}


@pytest.mark.asyncio
async def test_get_team():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_resp = await ac.post("/teams", json=_make_team_payload())
        team_id = create_resp.json()["_id"]
        resp = await ac.get(f"/teams/{team_id}")
        assert resp.status_code == 200
        assert resp.json()["_id"] == team_id


@pytest.mark.asyncio
async def test_get_team_not_found():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/teams/000000000000000000000000")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_team():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_resp = await ac.post("/teams", json=_make_team_payload())
        team_id = create_resp.json()["_id"]
        resp = await ac.put(f"/teams/{team_id}", json={"name": "Updated Team"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Team"
        assert len(resp.json()["members"]) == 3


@pytest.mark.asyncio
async def test_update_team_members():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_resp = await ac.post("/teams", json=_make_team_payload())
        team_id = create_resp.json()["_id"]
        new_members = [{"id": "new1", "name": "New", "agent_id": "agent-9", "is_lead": True}]
        resp = await ac.put(f"/teams/{team_id}", json={"members": new_members})
        assert resp.status_code == 200
        assert len(resp.json()["members"]) == 1
        assert resp.json()["members"][0]["name"] == "New"


@pytest.mark.asyncio
async def test_delete_team():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_resp = await ac.post("/teams", json=_make_team_payload())
        team_id = create_resp.json()["_id"]
        resp = await ac.delete(f"/teams/{team_id}")
        assert resp.status_code == 200
        assert resp.json()["message"] == "Team deleted"
        resp = await ac.get(f"/teams/{team_id}")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_start_team_run():
    with patch("app.api.teams.run_team", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            create_resp = await ac.post("/teams", json=_make_team_payload())
            team_id = create_resp.json()["_id"]
            resp = await ac.post(f"/teams/{team_id}/run", json={
                "user_input": "Write an article about AI",
                "max_rounds": 3,
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["user_input"] == "Write an article about AI"
            assert data["max_rounds"] == 3
            assert data["status"] == "running"
            assert "run_id" in data


@pytest.mark.asyncio
async def test_start_team_run_default_max_rounds():
    with patch("app.api.teams.run_team", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            create_resp = await ac.post("/teams", json=_make_team_payload())
            team_id = create_resp.json()["_id"]
            resp = await ac.post(f"/teams/{team_id}/run", json={
                "user_input": "Do something",
            })
            assert resp.status_code == 200
            assert resp.json()["max_rounds"] == 1


@pytest.mark.asyncio
async def test_list_team_runs():
    with patch("app.api.teams.run_team", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            create_resp = await ac.post("/teams", json=_make_team_payload())
            team_id = create_resp.json()["_id"]
            await ac.post(f"/teams/{team_id}/run", json={"user_input": "Task 1"})
            await ac.post(f"/teams/{team_id}/run", json={"user_input": "Task 2"})
            resp = await ac.get(f"/teams/{team_id}/runs")
            assert resp.status_code == 200
            runs = resp.json()
            assert len(runs) == 2


@pytest.mark.asyncio
async def test_stop_team_run():
    with patch("app.api.teams.run_team", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            create_resp = await ac.post("/teams", json=_make_team_payload())
            team_id = create_resp.json()["_id"]
            run_resp = await ac.post(f"/teams/{team_id}/run", json={"user_input": "Task"})
            run_id = run_resp.json()["run_id"]
            resp = await ac.post(f"/teams/{team_id}/runs/{run_id}/stop")
            assert resp.status_code == 200
            assert resp.json()["status"] == "error"


@pytest.mark.asyncio
async def test_stop_team_run_not_found():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_resp = await ac.post("/teams", json=_make_team_payload())
        team_id = create_resp.json()["_id"]
        resp = await ac.post(f"/teams/{team_id}/runs/000000000000000000000000/stop")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_stop_team_run_wrong_team():
    with patch("app.api.teams.run_team", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            team_a = await ac.post("/teams", json=_make_team_payload("Team A"))
            team_b = await ac.post("/teams", json=_make_team_payload("Team B"))
            team_a_id = team_a.json()["_id"]
            team_b_id = team_b.json()["_id"]
            run_resp = await ac.post(f"/teams/{team_a_id}/run", json={"user_input": "Task"})
            run_id = run_resp.json()["run_id"]
            resp = await ac.post(f"/teams/{team_b_id}/runs/{run_id}/stop")
            assert resp.status_code == 404


@pytest.mark.asyncio
async def test_stop_completed_run_fails():
    with patch("app.api.teams.run_team", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            create_resp = await ac.post("/teams", json=_make_team_payload())
            team_id = create_resp.json()["_id"]
            run_resp = await ac.post(f"/teams/{team_id}/run", json={"user_input": "Task"})
            run_id = run_resp.json()["run_id"]
            run = await TeamRun.get(run_id)
            run.status = "completed"
            await run.save()
            resp = await ac.post(f"/teams/{team_id}/runs/{run_id}/stop")
            assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_run_messages_empty():
    with patch("app.api.teams.run_team", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            create_resp = await ac.post("/teams", json=_make_team_payload())
            team_id = create_resp.json()["_id"]
            run_resp = await ac.post(f"/teams/{team_id}/run", json={"user_input": "Task"})
            run_id = run_resp.json()["run_id"]
            resp = await ac.get(f"/teams/{team_id}/runs/{run_id}/messages")
            assert resp.status_code == 200
            assert resp.json() == []


@pytest.mark.asyncio
async def test_list_run_messages_with_data():
    with patch("app.api.teams.run_team", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            create_resp = await ac.post("/teams", json=_make_team_payload())
            team_id = create_resp.json()["_id"]
            run_resp = await ac.post(f"/teams/{team_id}/run", json={"user_input": "Task"})
            run_id = run_resp.json()["run_id"]
            await TeamMessage(
                team_run_id=run_id, round=1, sender="user",
                message_type="user_input", content="Write an article"
            ).insert()
            await TeamMessage(
                team_run_id=run_id, round=1, sender="lead",
                message_type="task_assignment", content="Write it", target="writer"
            ).insert()
            await TeamMessage(
                team_run_id=run_id, round=1, sender="writer",
                message_type="work_result", content="Here is the article"
            ).insert()
            resp = await ac.get(f"/teams/{team_id}/runs/{run_id}/messages")
            assert resp.status_code == 200
            messages = resp.json()
            assert len(messages) == 3
            assert messages[0]["message_type"] == "user_input"
            assert messages[1]["message_type"] == "task_assignment"
            assert messages[1]["target"] == "writer"
            assert messages[2]["message_type"] == "work_result"


@pytest.mark.asyncio
async def test_list_run_messages_wrong_team():
    with patch("app.api.teams.run_team", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            team_a = await ac.post("/teams", json=_make_team_payload("Team A"))
            team_b = await ac.post("/teams", json=_make_team_payload("Team B"))
            team_a_id = team_a.json()["_id"]
            team_b_id = team_b.json()["_id"]
            run_resp = await ac.post(f"/teams/{team_a_id}/run", json={"user_input": "Task"})
            run_id = run_resp.json()["run_id"]
            resp = await ac.get(f"/teams/{team_b_id}/runs/{run_id}/messages")
            assert resp.status_code == 404


@pytest.mark.asyncio
async def test_team_run_fields():
    with patch("app.api.teams.run_team", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            create_resp = await ac.post("/teams", json=_make_team_payload())
            team_id = create_resp.json()["_id"]
            run_resp = await ac.post(f"/teams/{team_id}/run", json={
                "user_input": "Summarize this document",
                "max_rounds": 5,
            })
            run_id = run_resp.json()["run_id"]
            run = await TeamRun.get(run_id)
            assert run.user_input == "Summarize this document"
            assert run.max_rounds == 5
            assert run.current_round == 0
            assert run.team_id == team_id


@pytest.mark.asyncio
async def test_team_message_has_round():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_resp = await ac.post("/teams", json=_make_team_payload())
        team_id = create_resp.json()["_id"]
        run = TeamRun(team_id=team_id, user_input="Task", max_rounds=3)
        await run.insert()
        run_id = str(run.id)
        msg = await TeamMessage(
            team_run_id=run_id, round=2, sender="lead",
            message_type="coordination", content="Round 2 start"
        ).insert()
        assert msg.round == 2
