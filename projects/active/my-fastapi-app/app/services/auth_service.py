from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.schemas.auth import RegisterRequest
from app.core.security import hash_password, create_access_token, create_refresh_token, decode_refresh_token
from app.exceptions import DuplicateException, UnauthorizedException
from app.core.cache import blacklist_refresh_token, is_token_blacklisted
from app.config import settings


async def register_user(db: AsyncSession, request: RegisterRequest) -> User:
    existing = await db.execute(
        select(User).where((User.email == request.email) | (User.username == request.username))
    )
    if existing.scalar_one_or_none():
        raise DuplicateException("Email or username already registered")
    user = User(
        email=request.email,
        username=request.username,
        hashed_password=hash_password(request.password),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> tuple[str, str]:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise UnauthorizedException("Invalid email or password")
    from app.core.security import verify_password
    if not verify_password(password, user.hashed_password):
        raise UnauthorizedException("Invalid email or password")
    if not user.is_active:
        raise UnauthorizedException("Account is inactive")
    access = create_access_token(str(user.id))
    refresh = create_refresh_token(str(user.id))
    return access, refresh


async def refresh_access_token(db: AsyncSession, refresh_token_str: str) -> tuple[str, str]:
    payload = decode_refresh_token(refresh_token_str)
    if payload is None:
        raise UnauthorizedException("Invalid or expired refresh token")
    token_jti = payload.get("jti", refresh_token_str[-16:])
    if await is_token_blacklisted(token_jti):
        raise UnauthorizedException("Refresh token has been revoked")
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise UnauthorizedException("User not found or inactive")
    await blacklist_refresh_token(token_jti, settings.refresh_token_expire_seconds)
    return create_access_token(str(user.id)), create_refresh_token(str(user.id))


async def logout(refresh_token_str: str) -> None:
    payload = decode_refresh_token(refresh_token_str)
    if payload:
        token_jti = payload.get("jti", refresh_token_str[-16:])
        await blacklist_refresh_token(token_jti, settings.refresh_token_expire_seconds)
