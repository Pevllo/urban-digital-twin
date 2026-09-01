from typing import Dict, Any, Optional
from pydantic import BaseModel, Field, field_validator


# ============================================================================
# ACCEPTED DEVELOPMENT TYPES
# ============================================================================
#
# Union of frontend-friendly names AND model-native canonical names.
# The simulator_service.normalize_dev_type() layer resolves aliases
# (residential → residential_compound, commercial/retail → mall) before
# calling into the ML/DL model pipelines.
#
# Canonical trip-demand types:  residential_compound, hospital, mall, school, office
# Canonical electricity types: residential_compound, hospital, mall, school, office, hotel
# Special electricity handling: mixed_use (decomposed in electricity_service)
# ============================================================================

ACCEPTED_DEVELOPMENT_TYPES = {
    # Frontend-friendly aliases
    "residential",
    "commercial",
    "retail",
    # Model-canonical types (also accepted directly)
    "residential_compound",
    "hospital",
    "mall",
    "school",
    "office",
    "hotel",
    # Special composite type (electricity decomposes it)
    "mixed_use",
}


class DevelopmentPropertiesSchema(BaseModel):
    num_residents: Optional[float] = 0
    num_units: Optional[float] = 0
    num_beds: Optional[float] = 0
    staff_count: Optional[float] = 0
    gross_leasable_area_sqm: Optional[float] = 0
    visitor_capacity: Optional[float] = 0
    num_students: Optional[float] = 0
    num_employees: Optional[float] = 0
    gross_floor_area_sqm: Optional[float] = 0

class DevelopmentSchema(BaseModel):
    id: Optional[str] = Field(None, alias="development_id")
    development_id: Optional[str] = None
    type: str = Field(..., alias="development_type")
    development_type: str = ""
    name: str = ""
    latitude: float
    longitude: float
    x: Optional[float] = 0.0
    y: Optional[float] = 0.0
    z: Optional[float] = 0.0
    area: Optional[float] = 0.0
    height: Optional[float] = 0.0
    floors: Optional[int] = 1
    capacity: Optional[float] = 0.0
    residents: Optional[float] = 0.0
    jobs: Optional[float] = 0.0
    parking: Optional[float] = 0.0
    traffic_generation: Optional[float] = 0.0
    status: Optional[str] = "proposed"
    zone_id: Optional[str] = ""
    properties: Dict[str, Any] = Field(default_factory=dict)
    simulation_hour: Optional[int] = 8

    @field_validator("development_type")
    @classmethod
    def validate_development_type(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ACCEPTED_DEVELOPMENT_TYPES:
            raise ValueError(
                f"Unsupported development_type '{v}'. "
                f"Accepted types: {sorted(ACCEPTED_DEVELOPMENT_TYPES)}"
            )
        return v

    def model_post_init(self, __context: Any) -> None:
        if not self.development_id and self.id:
            self.development_id = self.id
        elif not self.id and self.development_id:
            self.id = self.development_id

        if not self.development_type and self.type:
            self.development_type = self.type
        elif not self.type and self.development_type:
            self.type = self.development_type

class SimulationRequestSchema(BaseModel):
    development_id: str
    development_type: str
    zone_id: Optional[str] = ""
    name: Optional[str] = ""
    properties: Dict[str, Any] = Field(default_factory=dict)
    simulation_hour: Optional[int] = 8
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    @field_validator("development_type")
    @classmethod
    def validate_development_type(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ACCEPTED_DEVELOPMENT_TYPES:
            raise ValueError(
                f"Unsupported development_type '{v}'. "
                f"Accepted types: {sorted(ACCEPTED_DEVELOPMENT_TYPES)}"
            )
        return v
