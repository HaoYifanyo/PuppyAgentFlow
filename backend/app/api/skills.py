from fastapi import APIRouter, HTTPException
from typing import Any, Dict, List

from beanie import PydanticObjectId

from app.models.workflow import Skill
from app.services.skill_service import SkillFileService

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=List[Skill])
async def list_skills():
    return await Skill.find_all().to_list()


@router.post("", response_model=Skill)
async def create_skill(skill: Skill):
    await skill.insert()
    try:
        SkillFileService.save(skill)
    except Exception as e:
        print(f"Warning: Failed to save skill to disk: {e}")
    return skill


@router.post("/generate", response_model=Skill)
async def generate_skill(request: Dict[str, str]):
    instruction = request.get("instruction")
    if not instruction:
        raise HTTPException(status_code=400, detail="instruction is required")

    from app.services.llm_executor import generate_skill_with_llm

    try:
        skill_data = generate_skill_with_llm(instruction)
        skill = Skill(**skill_data)
        await skill.insert()
        try:
            SkillFileService.save(skill)
        except Exception as e:
            print(f"Warning: Failed to save generated skill to disk: {e}")
        return skill
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate skill: {str(e)}")


@router.put("/{id}", response_model=Skill)
async def update_skill(id: PydanticObjectId, skill_data: Dict[str, Any]):
    skill = await Skill.get(id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    for field in ("name", "type", "description", "implementation", "input_schema", "output_schema"):
        if field in skill_data:
            setattr(skill, field, skill_data[field])

    await skill.save()
    try:
        SkillFileService.save(skill)
    except Exception as e:
        print(f"Warning: Failed to save skill to disk: {e}")
    return skill


@router.delete("/{id}")
async def delete_skill(id: PydanticObjectId):
    skill = await Skill.get(id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    await skill.delete()
    return {"message": "Skill deleted"}
