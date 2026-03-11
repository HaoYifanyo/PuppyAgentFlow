from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.database import init_db
from app.api.endpoints import router as api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize the database on startup
    await init_db()
    yield
    # Cleanup on shutdown if needed

app = FastAPI(title="Agent Workflow API", lifespan=lifespan)

app.include_router(api_router)