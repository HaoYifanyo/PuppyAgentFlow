# PuppyAgentFlow

PuppyAgentFlow is a demo-stage **AI agent workflow system** that aims to:

- Let non-technical users **easily build their own workflows**
- Insert **human review / human-in-the-loop** at critical steps
- Avoid **forgetting important execution steps** in automated flows

---

## Demo

### Create Agent

![Create Agent](./docs/gif/create_agent.gif)

### Easy Drag and Drop

![Easy Drag and Drop](./docs/gif/easy_drag_drop.gif)

### Run Workflow

![Run Workflow](./docs/gif/test_run.gif)

---

## Architecture

![PuppyAgentFlow Architecture](./docs/architecture.png)

- **Workflow for ordinary users** — compose steps, reuse agents/skills, see where human review is needed.
- **Human-in-the-loop** — manual checkpoints for sensitive or irreversible actions.
- **Extensible** — plug different LLM backends via unified agent/skill APIs.
- **Knowledge Base & RAG** — upload documents, build knowledge bases, and let LLM nodes retrieve relevant context automatically.
- **Condition Node** — route workflow execution to different branches based on runtime conditions.

---

## Tech Stack

| Layer    | Stack                                                  |
| -------- | ------------------------------------------------------ |
| Backend  | Python, FastAPI, LangGraph, MongoDB (Beanie), ChromaDB |
| Frontend | React, Vite, TypeScript, React Flow                    |
| Tests    | pytest (backend), Playwright (frontend)                |

---

## Quick Start

**Prerequisites:** Python 3.x, Node.js, MongoDB (local or remote)

1. **Backend**

   ```bash
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1   # Windows PowerShell
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```

2. **Frontend** (new terminal)

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Open `http://localhost:5173` — create workflows, add human-review nodes, run and observe.

---

## Testing

**Backend** (from `backend/`):

```bash
pytest
```

**Frontend** (from `frontend/`):

```bash
npx playwright test
```

E2E test requires backend + MongoDB running.

---

## Knowledge Base & RAG

PuppyAgentFlow includes a built-in **Retrieval-Augmented Generation (RAG)** system powered by ChromaDB.

### Knowledge Base Management

- Upload documents: **PDF, TXT, Markdown, CSV, HTML**
- Documents are automatically chunked and embedded for vector search

### RAG-Enhanced LLM Nodes

Any LLM node can optionally connect to a knowledge base:

1. Open an LLM node's settings
2. Select a knowledge base and set Top K (default: 3)
3. When the node runs, it automatically retrieves relevant chunks and injects them as context into the LLM prompt

---

## Condition Node

Use a Condition Node to route the workflow into different branches based on rule checks in runtime context.

Typical use cases:

- Continue only when required fields are present
- Choose different downstream agents for different intents

---

## Future

- Agent group
- Hybrid search (vector + keyword/BM25) and reranking
- Better persistence and deployment story
