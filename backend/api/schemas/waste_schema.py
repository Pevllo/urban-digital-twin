from typing import Dict, Any, Optional
from pydantic import BaseModel, Field, field_validator


class WastePredictRequest(BaseModel):
    development_type: str = Field(..., description="Canonical development type")
    month: int = Field(6, ge=1, le=12)
    day_of_week: int = Field(2, ge=0, le=6)
    temperature_c: float = Field(25.0, ge=-50, le=60)
    zone_lat: Optional[float] = None
    zone_lon: Optional[float] = None
    properties: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("development_type")
    @classmethod
    def _check_type(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ("residential_compound", "hospital", "mall", "school", "office"):
            raise ValueError(
                f"development_type '{v}' not supported. "
                f"Accepted: {['residential_compound', 'hospital', 'mall', 'school', 'office']}"
            )
        return v


class WastePredictResponse(BaseModel):
    waste_generation_kg: float
    waste_generation_tonnes: float
    development_type: str
    model: str
