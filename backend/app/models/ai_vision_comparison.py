from datetime import datetime

from sqlalchemy import JSON, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AiVisionComparison(Base):
    """
    A stored Gemini Vision comparison of two photos (a sighting vs a registered pet or another sighting).
    pair_key = hash of both photo URLs + the descriptions sent to Gemini, so a changed photo or description is
    compared again, while a rescan of the same pair reuses the result instead of calling Gemini.
    """
    __tablename__ = "ai_vision_comparisons"

    pair_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    result: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
