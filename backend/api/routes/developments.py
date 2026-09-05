import logging

from fastapi import APIRouter, HTTPException, status

from backend.api.schemas.development_schema import DevelopmentSchema
from backend.storage.development_store import (
    create_development,
    delete_development,
    get_development,
    list_developments,
    update_development,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/developments", tags=["Developments"])


def _to_store_dict(dev: DevelopmentSchema) -> dict:
    return {
        "development_id": dev.development_id or dev.id,
        "development_type": dev.development_type or dev.type,
        "name": dev.name,
        "latitude": dev.latitude,
        "longitude": dev.longitude,
        "area": dev.area or 0,
        "height": dev.height or 0,
        "floors": dev.floors or 1,
        "capacity": dev.capacity or 0,
        "status": dev.status or "proposed",
        "zone_id": dev.zone_id or "",
        "properties": dev.properties or {},
    }


@router.get("")
def list_developments_endpoint():
    return list_developments()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_development_endpoint(dev: DevelopmentSchema):
    if not dev.development_id and not dev.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="development_id is required.",
        )
    created = create_development(_to_store_dict(dev))
    return created


@router.get("/{dev_id}")
def get_development_endpoint(dev_id: str):
    found = get_development(dev_id)
    if found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Development '{dev_id}' not found.",
        )
    return found


@router.put("/{dev_id}")
def update_development_endpoint(dev_id: str, dev: DevelopmentSchema):
    updated = update_development(dev_id, _to_store_dict(dev))
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Development '{dev_id}' not found.",
        )
    return updated


@router.delete("/{dev_id}")
def delete_development_endpoint(dev_id: str):
    deleted = delete_development(dev_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Development '{dev_id}' not found.",
        )
    return {"status": "deleted", "id": dev_id}
