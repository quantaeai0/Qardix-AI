from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone

from app.database.connection import get_db
from app.models.models import User, AccountStatus, AppRole, UsageEvent
from app.schemas.auth import LoginRequest, TokenResponse, RefreshTokenRequest, PasswordResetRequest, UserMinResponse
from app.auth.passwords import verify_password, get_password_hash
from app.auth.jwt import create_access_token, create_refresh_token, decode_token
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    login_id = payload.login_id.strip()
    stmt = select(User).options(selectinload(User.company)).where(User.email == login_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/login ID or password",
        )

    if user.status != AccountStatus.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your Qardix AI account is currently inactive. Please contact your program administrator.",
        )

    if user.role in [AppRole.doctor, AppRole.marketing_manager] and user.company:
        if user.company.status != AccountStatus.active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your organisation access is currently inactive. Please contact your program administrator.",
            )

    # Update last activity
    user.last_activity_at = datetime.now(timezone.utc)
    
    # Record usage event
    usage = UsageEvent(
        company_id=user.company_id,
        doctor_id=user.id,
        event_type="login"
    )
    db.add(usage)
    await db.commit()
    await db.refresh(user)

    token_data = {"sub": str(user.id), "role": user.role.value}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    user_min = UserMinResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        company_id=user.company_id,
        company_name=user.company.name if user.company else None,
        specialty=user.specialty,
        status=user.status,
        force_password_reset=user.force_password_reset,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=user_min,
    )


@router.post("/refresh")
async def refresh_token(payload: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    try:
        data = decode_token(payload.refresh_token)
        if data.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = data.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or user.status != AccountStatus.active:
        raise HTTPException(status_code=401, detail="User inactive or not found")

    token_data = {"sub": str(user.id), "role": user.role.value}
    new_access_token = create_access_token(token_data)
    new_refresh_token = create_refresh_token(token_data)

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserMinResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserMinResponse(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        role=current_user.role,
        company_id=current_user.company_id,
        company_name=current_user.company.name if current_user.company else None,
        specialty=current_user.specialty,
        status=current_user.status,
        force_password_reset=current_user.force_password_reset,
    )


@router.post("/password-reset")
async def password_reset(
    payload: PasswordResetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect current password")

    current_user.hashed_password = get_password_hash(payload.new_password)
    current_user.force_password_reset = False
    await db.commit()

    return {"message": "Password updated successfully"}
