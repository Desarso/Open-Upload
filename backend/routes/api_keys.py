from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from typing import List, Optional

from database import get_db
from models import User, Project, ApiKey, ApiKeyCreate, ApiKeyRead
from auth import get_current_db_user

# Create routers
router = APIRouter(prefix="/api-keys", include_in_schema=False)
router_frontend = APIRouter(prefix="/frontend/api-keys", include_in_schema=False)

# --- Firebase Auth Routes (shown in docs) ---

@router.post("/", response_model=ApiKeyRead, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    key_data: ApiKeyCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_db_user)
):
    """Creates a new API key for a specified project."""
    project = session.get(Project, key_data.project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.user_firebase_uid != current_user.firebase_uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to create API key for this project")

    new_key = ApiKey(
        project_id=key_data.project_id,
        user_firebase_uid=current_user.firebase_uid
    )
    session.add(new_key)
    session.commit()
    session.refresh(new_key)
    return new_key

@router.get("/", response_model=List[ApiKeyRead])
async def get_api_keys(
    project_id: Optional[int] = None,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_db_user),
    skip: int = 0,
    limit: int = 100
):
    """Lists API keys for the authenticated user."""
    statement = select(ApiKey).where(ApiKey.user_firebase_uid == current_user.firebase_uid)
    if project_id is not None:
        project = session.get(Project, project_id)
        if not project or project.user_firebase_uid != current_user.firebase_uid:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found or not owned by user")
        statement = statement.where(ApiKey.project_id == project_id)

    statement = statement.offset(skip).limit(limit)
    api_keys = session.exec(statement).all()
    return api_keys

@router.delete("/{api_key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    api_key_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_db_user)
):
    """Deletes an API key by ID."""
    api_key = session.get(ApiKey, api_key_id)
    if not api_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API Key not found")
    if api_key.user_firebase_uid != current_user.firebase_uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this API key")

    session.delete(api_key)
    session.commit()
    return None

# --- API Key Routes ---

@router_frontend.get("/api/verify", response_model=ApiKeyRead)
async def verify_api_key(
    api_key: str,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_db_user)
):
    """Verify an API key belongs to the current user."""
    statement = select(ApiKey).where(
        ApiKey.key == api_key,
        ApiKey.user_firebase_uid == current_user.firebase_uid,
        ApiKey.is_active == True
    )
    db_key = session.exec(statement).first()
    if not db_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found or not owned by user"
        )
    return db_key
