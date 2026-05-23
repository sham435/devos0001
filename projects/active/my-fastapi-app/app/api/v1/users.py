from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.dependencies import get_db, get_current_user, get_current_superuser
from app.schemas.user import UserRead, UserUpdate
from app.schemas.item import Page
from app.services import user_service
from app.models.user import User

router = APIRouter()


@router.get("/me", response_model=UserRead)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    return current_user


@router.patch("/me", response_model=UserRead)
async def update_me(
    update: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = await user_service.update_user(db, current_user, update)
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await user_service.delete_user(db, current_user)


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    user = await user_service.get_user_by_id(db, str(user_id))
    if user is None:
        from app.exceptions import NotFoundException
        raise NotFoundException("User not found")
    return user


@router.get("/", response_model=Page)
async def get_users(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    users, total = await user_service.get_users(db, skip=skip, limit=limit)
    return Page(
        items=[UserRead.model_validate(u) for u in users],
        total=total,
        page=skip // limit + 1 if limit else 1,
        size=limit,
        pages=(total + limit - 1) // limit if limit else 1,
    )
