from fastapi import APIRouter

from app.api import skills, workflows, runs, agents, teams

router = APIRouter()

router.include_router(skills.router)
router.include_router(workflows.router)
router.include_router(runs.router)
router.include_router(agents.router)
router.include_router(teams.router)
