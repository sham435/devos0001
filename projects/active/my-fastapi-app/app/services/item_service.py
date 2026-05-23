from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import Optional
import uuid

from app.models.item import Item
from app.schemas.item import ItemCreate, ItemUpdate
from app.exceptions import NotFoundException, ForbiddenException


async def get_item_by_id(db: AsyncSession, item_id: uuid.UUID) -> Optional[Item]:
    result = await db.execute(select(Item).where(Item.id == item_id))
    return result.scalar_one_or_none()


async def get_items(
    db: AsyncSession, user_id: uuid.UUID, skip: int = 0, limit: int = 20
) -> tuple[list[Item], int]:
    total_result = await db.execute(
        select(func.count(Item.id)).where(
            or_(Item.owner_id == user_id, Item.is_public.is_(True))
        )
    )
    total = total_result.scalar() or 0

    result = await db.execute(
        select(Item)
        .where(or_(Item.owner_id == user_id, Item.is_public.is_(True)))
        .offset(skip)
        .limit(limit)
        .order_by(Item.created_at.desc())
    )
    items = list(result.scalars().all())
    return items, total


async def create_item(db: AsyncSession, item_in: ItemCreate, owner_id: uuid.UUID) -> Item:
    item = Item(
        title=item_in.title,
        description=item_in.description,
        is_public=item_in.is_public,
        owner_id=owner_id,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def update_item(
    db: AsyncSession, item: Item, item_in: ItemUpdate, user_id: uuid.UUID
) -> Item:
    if item.owner_id != user_id:
        raise ForbiddenException("You do not own this item")

    update_data = item_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def delete_item(db: AsyncSession, item: Item, user_id: uuid.UUID) -> None:
    if item.owner_id != user_id:
        raise ForbiddenException("You do not own this item")
    await db.delete(item)
    await db.flush()
