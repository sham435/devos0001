from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid


class ItemBase(BaseModel):
    title: str
    description: Optional[str] = None
    is_public: bool = False


class ItemCreate(ItemBase):
    pass


class ItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None


class ItemRead(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class Page(BaseModel):
    items: List
    total: int
    page: int
    size: int
    pages: int
