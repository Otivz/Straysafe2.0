from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class CoverageAreaResponse(BaseModel):
    id: int = 1
    subdivision_id: Optional[int] = 1
    center_label: str = "Selera Homes"
    center_latitude: float = 14.801042
    center_longitude: float = 121.003648
    radius_meters: int = 1000
    boundary_polygon: List[Dict[str, float]] = []
    is_active: bool = True
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CoverageAreaUpdate(BaseModel):
    radius_meters: int = Field(..., ge=50, le=50000, description="Reporting radius in meters from Selera Homes center")
