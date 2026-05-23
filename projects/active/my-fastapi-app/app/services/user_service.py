from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from app.models.user import User
from app.schemas.user import UserUpdate
from app.exceptions import NotFoundException, DuplicateException


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_users(db: AsyncSession, skip: int = 0, limit: int = 20) -> tuple[list[User], int]:
    total = (await db.execute(select(func.count(User.id)))).scalar() or 0
    result = await db.execute(
        select(User).offset(skip).limit(limit).order_by(User.created_at.desc())
    )
    return list(result.scalars().all()), total


async def update_user(db: AsyncSession, user: User, update: UserUpdate) -> User:
    data = update.model_dump(exclude_unset=True)
    if "email" in data and data["email"] is not None:
        existing = await get_user_by_email(db, data["email"])
        if existing and existing.id != user.id:
            raise DuplicateException("Email already in use")
    for field, value in data.items():
        setattr(user, field, value)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user: User) -> None:
    await db.delete(user)
    await db.flush()
