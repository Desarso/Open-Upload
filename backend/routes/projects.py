from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, func
from typing import List, Optional
from pydantic import BaseModel
from sqlalchemy import BigInteger

from database import get_db
from models import Project, ProjectCreate, ProjectRead, ProjectReadWithKeys, User, ApiKey, File
from auth import get_current_db_user, get_api_key_user

# Project stats response model
class ProjectStats(BaseModel):
    total_storage: int  # in bytes
    total_files: int

# Create routers
router = APIRouter(prefix="/projects", include_in_schema=False)
router_frontend = APIRouter(prefix="/frontend/projects", include_in_schema=False)

@router.get("/{project_id}/stats", response_model=ProjectStats)
async def get_project_stats(
    project_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_db_user)
):
    """Gets storage and file statistics for a specific project."""
    # First verify project exists and user has access
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.user_firebase_uid != current_user.firebase_uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this project")
    
    # Get stats
    stats = session.query(
        func.coalesce(func.sum(File.size), 0).cast(BigInteger).label('total_storage'),
        func.count(File.id).label('total_files')
    ).filter(
        File.project_id == project_id
    ).first()
    
    return ProjectStats(
        total_storage=stats.total_storage,
        total_files=stats.total_files
    )

# --- Firebase Auth Routes (shown in docs) ---

@router.post("/", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_db_user)
):
    """Creates a new project for the authenticated user."""
    if project_data.user_firebase_uid != current_user.firebase_uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create project for another user.",
        )

    new_project = Project.model_validate(project_data)
    session.add(new_project)
    session.commit()
    session.refresh(new_project)
    return new_project

@router.get("/", response_model=List[ProjectRead])
async def get_projects(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_db_user),
    skip: int = 0,
    limit: int = 100
):
    """Lists projects belonging to the authenticated user."""
    statement = select(Project).where(Project.user_firebase_uid == current_user.firebase_uid).offset(skip).limit(limit)
    projects = session.exec(statement).all()
    return projects

@router.get("/{project_id}", response_model=ProjectReadWithKeys)
async def get_project(
    project_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_db_user)
):
    """Gets a specific project by ID, including its API keys."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.user_firebase_uid != current_user.firebase_uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this project")
    return project

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_db_user)
):
    """Deletes a project by ID."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.user_firebase_uid != current_user.firebase_uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this project")

    session.delete(project)
    session.commit()
    return None

# --- API Key Routes ---

@router_frontend.get("/api/info", response_model=ProjectRead)
async def get_project_info(
    user_project_key: tuple[User, Project, ApiKey] = Depends(get_api_key_user),
):
    """Get project information using API key authentication."""
    _, project, _ = user_project_key
    return project
