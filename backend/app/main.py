from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.database import init_db
from app.api.router import router

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="Agent Workflow API", lifespan=lifespan)

app.include_router(router)