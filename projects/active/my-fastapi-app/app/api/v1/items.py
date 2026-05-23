from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.dependencies import get_db, get_current_user
from app.schemas.item import ItemCreate, ItemRead, ItemUpdate, Page
from app.services import item_service
from app.models.user import User
from app.exceptions import NotFoundException

router = APIRouter()


@router.get("/", response_model=Page)
async def get_items(skip: int = 0, limit: int = 20, db: AsyncSession = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    items, total = await item_service.get_items(db, current_user.id, skip=skip, limit=limit)
    return Page(items=[ItemRead.model_validate(i) for i in items], total=total,
                page=skip // limit + 1, size=limit, pages=(total + limit - 1) // limit if limit else 1)


@router.post("/", response_model=ItemRead, status_code=201)
async def create_item(item_in: ItemCreate, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    return await item_service.create_item(db, item_in, current_user.id)


@router.get("/{item_id}", response_model=ItemRead)
async def get_item(item_id: uuid.UUID, db: AsyncSession = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    item = await item_service.get_item_by_id(db, item_id)
    if item is None:
        raise NotFoundException("Item not found")
    if item.owner_id != current_user.id and not item.is_public:
        raise NotFoundException("Item not found")
    return item


@router.patch("/{item_id}", response_model=ItemRead)
async def update_item(item_id: uuid.UUID, item_in: ItemUpdate, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    item = await item_service.get_item_by_id(db, item_id)
    if item is None:
        raise NotFoundException("Item not found")
    return await item_service.update_item(db, item, item_in, current_user.id)


@router.delete("/{item_id}", status_code=204)
async def delete_item(item_id: uuid.UUID, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    item = await item_service.get_item_by_id(db, item_id)
    if item is None:
        raise NotFoundException("Item not found")
    await item_service.delete_item(db, item, current_user.id)
