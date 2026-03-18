import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from backend.app.main import app
from time import sleep

def run_real_llm_test():
    from dotenv import load_dotenv
    import os
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
    print("Initializing TestClient...")
    with TestClient(app) as client:
        # Create a workflow with a Tool Node -> LLM Node
        print("1. Creating Workflow with real LLM configuration...")
        workflow_data = {
            "name": "News Summarizer Workflow",
            "nodes": [
                {
                    "id": "node_tool",
                    "name": "Mock News Search",
                    "skill_id": "tool_google_search",
                    "require_approval": False
                },
                {
                    "id": "node_llm",
                    "name": "AI Summarizer",
                    "skill_id": "summarize",
                    "require_approval": True, # Pause here to review summary
                    "config": {
                        "instruction": "Summarize the search results provided. You must output a JSON object with 'title' (a catchy headline) and 'summary' (a brief one sentence summary).",
                        "output_schema": {
                            "title": "string",
                            "summary": "string"
                        }
                    }
                }
            ],
            "edges": [
                {
                    "source": "node_tool",
                    "target": "node_llm",
                    "data_mapping": {"search_data": "results"}
                }
            ]
        }

        res = client.post("/workflows", json=workflow_data)
        assert res.status_code == 200, res.text
        wf_id = res.json()["_id"]

        # Start the run
        print(f"2. Starting run...")
        res = client.post(f"/workflows/{wf_id}/run", json={"query": "AI Agents 2026"})
        assert res.status_code == 200, res.text
        run_id = res.json()["_id"]

        # Wait for the run to hit the pause state (since LLM is async and might take a sec)
        # Actually our engine is synchronous for now in the demo
        run_data = res.json()
        print(f"Status after initial run: {run_data['status']}")

        # We expect it to be paused at node_llm
        if run_data['status'] == "paused":
            llm_output = run_data["node_runs"]["node_llm"]["outputs"]
            print("\n----- SUCCESS: LLM GENERATED JSON OUTPUT -----")
            print(llm_output)
            print("----------------------------------------------\n")

            # Resume
            print("3. Approving and Resuming...")
            res = client.post(f"/runs/{run_id}/nodes/node_llm/resume", json={"action": "approve"})
            print(f"Final Status: {res.json()['status']}")
        else:
            print(f"Error: Run did not pause. Node states: {run_data['node_runs']}")

if __name__ == "__main__":
    run_real_llm_test()
