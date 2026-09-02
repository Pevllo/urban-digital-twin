from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field, field_validator


class WaterPredictRequest(BaseModel):
    development_type: str = Field(..., description="Canonical development type")
    zone_id: Optional[str] = ""
    temperature_c: float = Field(25.0, ge=-50, le=60)
    hour: int = Field(8, ge=0, le=23)
    month: int = Field(7, ge=1, le=12)
    day_of_week: int = Field(3, ge=0, le=6)
    is_weekend: bool = False
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


class WaterPredictResponse(BaseModel):
    prediction: float
    unit: str
    prediction_liters: float
    model: str
    scenario: Dict[str, Any] = Field(default_factory=dict)
