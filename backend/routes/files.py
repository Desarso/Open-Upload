from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File as FastAPIFile, Form, Request
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from typing import List, Optional
import shutil
import datetime
import mimetypes
from pathlib import Path
import time

from database import get_db
from helpers.Firebase_helpers import role_based_access
from models import User, Project, ApiKey, File, FileCreate, FileRead, ApiUsage
from auth import get_current_db_user, get_api_key_user

# Create upload directory
UPLOAD_DIR = Path("db/uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Create routers
router = APIRouter(prefix="/api/v1/files", tags=["Files API"])
router_frontend = APIRouter(prefix="/frontend/files", include_in_schema=False)
router_frontend.dependencies.append(Depends(role_based_access(["whitelisted"])))

router_public = APIRouter(prefix="/files", include_in_schema=True, tags=["Public Files API"])

async def track_api_usage(
    endpoint: str,
    user_firebase_uid: str,
    project_id: int,
    api_key_id: int,
    session: Session,
    status_code: int,
    start_time: float
):
    """Track API usage for a request."""
    response_time = (time.time() - start_time) * 1000  # Convert to milliseconds
    usage = ApiUsage(
        endpoint=endpoint,
        response_time=response_time,
        status_code=status_code,
        user_firebase_uid=user_firebase_uid,
        project_id=project_id,
        api_key_id=api_key_id
    )
    session.add(usage)
    session.commit()

# --- API Key Routes (shown in docs) ---

@router.post("/upload", response_model=FileRead, include_in_schema=True)
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    user_project_key: tuple[User, Project, ApiKey] = Depends(get_api_key_user),
    session: Session = Depends(get_db)
):
    """Upload a file using API key authentication."""
    start_time = time.time()
    user, project, api_key = user_project_key
    
    try:
        # Create project directory if it doesn't exist
        project_dir = UPLOAD_DIR / str(project.id)
        project_dir.mkdir(exist_ok=True)
        
        # Generate unique filename
        timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        safe_filename = f"{timestamp}_{file.filename}"
        file_path = project_dir / safe_filename
        
        # Save file
        try:
            with file_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        finally:
            file.file.close()
        
        # Create file record
        mime_type = mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
        db_file = File(
            filename=file.filename,
            size=file_path.stat().st_size,
            mime_type=mime_type,
            storage_path=str(file_path),
            project_id=project.id,
            user_firebase_uid=user.firebase_uid
        )
        
        session.add(db_file)
        session.commit()
        session.refresh(db_file)
        
        await track_api_usage(
            endpoint="/api/v1/files/upload",
            user_firebase_uid=user.firebase_uid,
            project_id=project.id,
            api_key_id=api_key.id,
            session=session,
            status_code=200,
            start_time=start_time
        )
        
        return db_file
    except Exception as e:
        await track_api_usage(
            endpoint="/api/v1/files/upload",
            user_firebase_uid=user.firebase_uid,
            project_id=project.id,
            api_key_id=api_key.id,
            session=session,
            status_code=500,
            start_time=start_time
        )
        raise

@router.get("/list", response_model=List[FileRead], include_in_schema=True)
async def list_files(
    user_project_key: tuple[User, Project, ApiKey] = Depends(get_api_key_user),
    session: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """List files in a project using API key authentication."""
    start_time = time.time()
    user, project, api_key = user_project_key
    
    try:
        statement = select(File).where(
            File.project_id == project.id
        ).offset(skip).limit(limit)
        
        files = session.exec(statement).all()
        
        await track_api_usage(
            endpoint="/api/v1/files/list",
            user_firebase_uid=user.firebase_uid,
            project_id=project.id,
            api_key_id=api_key.id,
            session=session,
            status_code=200,
            start_time=start_time
        )
        
        return files
    except Exception as e:
        await track_api_usage(
            endpoint="/api/v1/files/list",
            user_firebase_uid=user.firebase_uid,
            project_id=project.id,
            api_key_id=api_key.id,
            session=session,
            status_code=500,
            start_time=start_time
        )
        raise

@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=True)
async def delete_file(
    file_id: int,
    user_project_key: tuple[User, Project, ApiKey] = Depends(get_api_key_user),
    session: Session = Depends(get_db)
):
    """Delete a file using API key authentication."""
    start_time = time.time()
    user, project, api_key = user_project_key
    
    try:
        # Get file record
        file = session.get(File, file_id)
        if not file:
            await track_api_usage(
                endpoint=f"/api/v1/files/{file_id}",
                user_firebase_uid=user.firebase_uid,
                project_id=project.id,
                api_key_id=api_key.id,
                session=session,
                status_code=404,
                start_time=start_time
            )
            raise HTTPException(status_code=404, detail="File not found")
        
        # Verify file belongs to project
        if file.project_id != project.id:
            await track_api_usage(
                endpoint=f"/api/v1/files/{file_id}",
                user_firebase_uid=user.firebase_uid,
                project_id=project.id,
                api_key_id=api_key.id,
                session=session,
                status_code=403,
                start_time=start_time
            )
            raise HTTPException(status_code=403, detail="Not authorized to delete this file")
        
        # Delete file from disk
        file_path = Path(file.storage_path)
        if file_path.exists():
            file_path.unlink()
        
        # Delete file record
        session.delete(file)
        session.commit()
        
        await track_api_usage(
            endpoint=f"/api/v1/files/{file_id}",
            user_firebase_uid=user.firebase_uid,
            project_id=project.id,
            api_key_id=api_key.id,
            session=session,
            status_code=204,
            start_time=start_time
        )
        
        return None
    except Exception as e:
        if not isinstance(e, HTTPException):
            await track_api_usage(
                endpoint=f"/api/v1/files/{file_id}",
                user_firebase_uid=user.firebase_uid,
                project_id=project.id,
                api_key_id=api_key.id,
                session=session,
                status_code=500,
                start_time=start_time
            )
        raise

# --- Firebase Auth Routes (hidden from docs) ---

@router_frontend.post("/upload", response_model=FileRead)
async def upload_file_frontend(
    request: Request,
    file: UploadFile = FastAPIFile(...),
    project_id: int = Form(...),
    session: Session = Depends(get_db)
):
    """Upload a file using Firebase authentication."""
    current_user = request.state.user
    
    project = session.get(Project, project_id)
    if not project or project.user_firebase_uid != current_user.firebase_uid:
        raise HTTPException(status_code=403, detail="Not authorized to upload to this project")
    
    # Create project directory if it doesn't exist
    project_dir = UPLOAD_DIR / str(project.id)
    project_dir.mkdir(exist_ok=True)
    
    # Generate unique filename
    timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{timestamp}_{file.filename}"
    file_path = project_dir / safe_filename
    
    # Save file
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()
    
    # Create file record
    mime_type = mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
    db_file = File(
        filename=file.filename,
        size=file_path.stat().st_size,
        mime_type=mime_type,
        storage_path=str(file_path),
        project_id=project.id,
        user_firebase_uid=current_user.firebase_uid
    )
    
    session.add(db_file)
    session.commit()
    session.refresh(db_file)
    
    return db_file

@router_frontend.get("/list", response_model=List[FileRead])
async def list_files_frontend(
    project_id: int,
    request: Request,
    session: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """List files in a project using Firebase authentication."""
    current_user = request.state.user
    
    # Verify project exists and belongs to user
    project = session.get(Project, project_id)
    if not project or project.user_firebase_uid != current_user.uid:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    
    statement = select(File).where(
        File.project_id == project.id
    ).offset(skip).limit(limit)
    
    files = session.exec(statement).all()
    return files

@router_frontend.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file_frontend(
    file_id: int,
    request: Request,
    session: Session = Depends(get_db)
):
    """Delete a file using Firebase authentication."""
    current_user = request.state.user
    
    # Get file record
    file = session.get(File, file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Verify file belongs to user
    if file.user_firebase_uid != current_user.firebase_uid:
        raise HTTPException(status_code=403, detail="Not authorized to delete this file")
    
    # Delete file from disk
    file_path = Path(file.storage_path)
    if file_path.exists():
        file_path.unlink()
    
    # Delete file record
    session.delete(file)
    session.commit()
    
    return None

# --- Public Routes (shown in docs) ---

@router_public.get("/{file_id}", response_class=FileResponse)
async def get_file_public(
    file_id: int,
    session: Session = Depends(get_db)
):
    """Download a file (public endpoint, no authentication required)."""
    # Get file record
    file = session.get(File, file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Check if file exists
    file_path = Path(file.storage_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    return FileResponse(
        path=file_path,
        filename=file.filename,
        media_type=file.mime_type,
        content_disposition_type='inline'
    )
