from sqlalchemy import Column, Integer, String, DateTime, func
from app.database import Base

class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(255), unique=True, index=True, nullable=False)
    token_type = Column(String(50), nullable=False, default="access")
    user_id = Column(Integer, nullable=True, index=True)
    revoked_at = Column(DateTime, server_default=func.now(), nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
