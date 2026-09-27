from datetime import datetime
from decimal import Decimal
from typing import Optional, Any
from sqlalchemy import Integer, String, DateTime, func, ForeignKey, Numeric, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class CoverageSetting(Base):
    __tablename__ = "coverage_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    subdivision_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id", ondelete="SET NULL"), nullable=True)
    center_label: Mapped[str] = mapped_column(String(100), default="Selera Homes")
    center_latitude: Mapped[Decimal] = mapped_column(Numeric(10, 8), default=Decimal("14.80104200"))
    center_longitude: Mapped[Decimal] = mapped_column(Numeric(11, 8), default=Decimal("121.00364800"))
    radius_meters: Mapped[int] = mapped_column(Integer, default=1000)
    boundary_polygon: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    updated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
