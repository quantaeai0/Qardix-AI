from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from uuid import UUID

from app.database.connection import get_db
from app.models.models import User, Company, AppRole, AccountStatus
from app.auth.jwt import decode_token

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
        user_id_str = payload.get("sub")
        if not user_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )
        user_id = UUID(user_id_str)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
        )

    stmt = select(User).options(selectinload(User.company)).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # 1. Check user status
    if user.status != AccountStatus.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your Qardix AI account is currently inactive. Please contact your program administrator.",
        )

    # 2. Check company status for Doctor / MM (PRD requirement)
    if user.role in [AppRole.doctor, AppRole.marketing_manager]:
        if user.company and user.company.status != AccountStatus.active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your organisation access is currently inactive. Please contact your program administrator.",
            )

    return user


def require_roles(*allowed_roles: AppRole):
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden for role: {current_user.role}",
            )
        return current_user
    return role_checker


require_super_admin = require_roles(AppRole.super_admin)
require_marketing_manager = require_roles(AppRole.marketing_manager, AppRole.super_admin)
require_doctor = require_roles(AppRole.doctor, AppRole.super_admin)
