from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlmodel import Session, select, func
from typing import List, Optional
from pydantic import BaseModel
from sqlalchemy import BigInteger

from database import get_db
from models import Project, ProjectCreate, ProjectRead, ProjectReadWithKeys, User, ApiKey, File
from auth import get_current_db_user, get_api_key_user
from helpers.Firebase_helpers import role_based_access

# Project stats response model
class ProjectStats(BaseModel):
    total_storage: int  # in bytes
    total_files: int

# Create routers
router = APIRouter(prefix="/projects", include_in_schema=False)
router.dependencies.append(Depends(role_based_access(["whitelisted"])))

@router.get("/{project_id}/stats", response_model=ProjectStats)
async def get_project_stats(
    project_id: int,
    request: Request,
    session: Session = Depends(get_db)
):
    """Gets storage and file statistics for a specific project."""
    current_user = request.state.user
    
    # First verify project exists and user has access
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.user_firebase_uid != current_user.uid:
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
    request: Request,
    session: Session = Depends(get_db)
):
    """Creates a new project for the authenticated user."""
    current_user = request.state.user
    
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
    request: Request,
    session: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """Lists projects belonging to the authenticated user."""
    current_user = request.state.user
    
    statement = select(Project).where(Project.user_firebase_uid == current_user.uid).offset(skip).limit(limit)
    projects = session.exec(statement).all()
    return projects

@router.get("/{project_id}", response_model=ProjectReadWithKeys)
async def get_project(
    project_id: int,
    request: Request,
    session: Session = Depends(get_db)
):
    """Gets a specific project by ID, including its API keys."""
    current_user = request.state.user
    
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.user_firebase_uid != current_user.uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this project")
    return project

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    request: Request,
    session: Session = Depends(get_db)
):
    """Deletes a project by ID."""
    current_user = request.state.user
    
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.user_firebase_uid != current_user.uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this project")

    session.delete(project)
    session.commit()
    return None

