from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

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
    zone_id: str
    properties: Dict[str, Any] = Field(default_factory=dict)
    simulation_hour: Optional[int] = 8

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
    zone_id: str
    name: Optional[str] = ""
    properties: Dict[str, Any] = Field(default_factory=dict)
    simulation_hour: Optional[int] = 8
