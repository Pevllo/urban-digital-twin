from fastapi import APIRouter
from backend.api.schemas.development_schema import DevelopmentSchema
from typing import List

router = APIRouter(prefix="/developments", tags=["Developments"])

_in_memory_developments = {}

@router.get("", response_model=List[DevelopmentSchema])
def list_developments():
    return list(_in_memory_developments.values())

@router.post("", response_model=DevelopmentSchema)
def create_development(dev: DevelopmentSchema):
    _in_memory_developments[dev.development_id or dev.id] = dev
    return dev

@router.delete("/{dev_id}")
def delete_development(dev_id: str):
    if dev_id in _in_memory_developments:
        del _in_memory_developments[dev_id]
        return {"status": "deleted", "id": dev_id}
    return {"status": "not_found", "id": dev_id}
