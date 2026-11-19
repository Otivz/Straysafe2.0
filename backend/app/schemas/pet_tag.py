from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class PetTagResponse(BaseModel):
    """The owner's (or Leader's) view of a pet's current QR tag. `tag` is None when the pet has no active tag."""
    pet_id: int
    has_tag: bool
    tag_id: Optional[int] = None
    token: Optional[str] = None
    link: Optional[str] = None
    created_at: Optional[datetime] = None
    # False when neither PUBLIC_TAG_BASE_URL nor FRONTEND_URL is set: the link then points at localhost and a printed
    # tag would not open on another phone.
    link_is_public: bool = False
    can_manage: bool = False  # create / replace / print: the owner only
    can_disable: bool = False  # the owner, or the Leader of the pet's subdivision
