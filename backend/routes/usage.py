from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlmodel import Session, select, func
from typing import List, Optional
from datetime import datetime, timedelta
from sqlalchemy import case, and_, BigInteger
from pydantic import BaseModel

from database import get_db
from models import User, Project, ApiKey, ApiUsage, ApiUsageRead, ApiUsageStats, File
from auth import get_current_db_user, get_api_key_user
from helpers.Firebase_helpers import role_based_access

# Dashboard stats response model
class DashboardStats(BaseModel):
    total_storage: int  # in bytes
    total_storage_limit: int  # in bytes
    total_files: int
    total_api_requests: int
    api_requests_change: float  # percentage change from previous period

# Create routers
router = APIRouter(prefix="/usage", include_in_schema=False)
router.dependencies.append(Depends(role_based_access(["whitelisted"])))

router_frontend = APIRouter(prefix="/frontend/usage", include_in_schema=False)
router_frontend.dependencies.append(Depends(role_based_access(["whitelisted"])))

@router.get("/dashboard-stats", response_model=DashboardStats)
async def get_dashboard_stats(
    request: Request,
    session: Session = Depends(get_db),
):
    """Get aggregated stats for the dashboard."""
    current_user = request.state.user
    
    # Calculate storage stats
    storage_result = session.query(
        func.coalesce(func.sum(File.size), 0).cast(BigInteger).label('total_storage'),
        func.count(File.id).label('total_files')
    ).filter(
        File.user_firebase_uid == current_user.uid
    ).first()
    
    # Calculate API requests for last 30 days
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=30)
    previous_start = start_date - timedelta(days=30)
    
    # Current period API requests
    current_requests = session.query(
        func.count(ApiUsage.id)
    ).filter(
        ApiUsage.user_firebase_uid == current_user.uid,
        ApiUsage.timestamp >= start_date,
        ApiUsage.timestamp <= end_date
    ).scalar() or 0
    
    # Previous period API requests
    previous_requests = session.query(
        func.count(ApiUsage.id)
    ).filter(
            ApiUsage.user_firebase_uid == current_user.uid,
        ApiUsage.timestamp >= previous_start,
        ApiUsage.timestamp < start_date
    ).scalar() or 0
    
    # Calculate percentage change
    if previous_requests > 0:
        change_percentage = ((current_requests - previous_requests) / previous_requests) * 100
    else:
        change_percentage = 0 if current_requests == 0 else 100
    
    # Storage limit (50GB for now, could be made dynamic based on user plan)
    storage_limit = 50 * 1024 * 1024 * 1024
    
    return DashboardStats(
        total_storage=storage_result.total_storage,
        total_storage_limit=storage_limit,
        total_files=storage_result.total_files,
        total_api_requests=current_requests,
        api_requests_change=change_percentage
    )

# --- Firebase Auth Routes (shown in docs) ---

@router.get("/", response_model=List[ApiUsageStats])
async def get_usage_stats(
    request: Request,
    session: Session = Depends(get_db),
    project_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Get usage statistics aggregated by day."""
    current_user = request.state.user
    
    # Base query filters
    filters = [ApiUsage.user_firebase_uid == current_user.uid]
    
    # Add project filter if specified
    if project_id is not None:
        filters.append(ApiUsage.project_id == project_id)
    
    # Add date range filters
    if start_date:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        filters.append(ApiUsage.timestamp >= start)
    if end_date:
        end = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        filters.append(ApiUsage.timestamp < end)
    
    # Query for daily statistics
    results = session.query(
        func.date(ApiUsage.timestamp).label('date'),
        func.count(ApiUsage.id).label('api_calls'),
        func.avg(ApiUsage.response_time).label('avg_response_time'),
        (func.sum(case((ApiUsage.status_code < 400, 1), else_=0)) * 100.0 / func.count(ApiUsage.id)).label('success_rate')
    ).filter(
        *filters
    ).group_by(
        func.date(ApiUsage.timestamp)
    ).order_by(
        func.date(ApiUsage.timestamp)
    ).all()
    
    # Convert to list of ApiUsageStats
    stats = [
        ApiUsageStats(
            date=str(result.date),
            api_calls=result.api_calls,
            avg_response_time=float(result.avg_response_time or 0),
            success_rate=float(result.success_rate or 100.0)
        )
        for result in results
    ]
    
    return stats

@router.get("/details", response_model=List[ApiUsageRead])
async def get_usage_details(
    request: Request,
    session: Session = Depends(get_db),
    project_id: Optional[int] = None,
    api_key_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
):
    """Get detailed usage records with optional filtering."""
    current_user = request.state.user
    
    statement = select(ApiUsage).where(ApiUsage.user_firebase_uid == current_user.uid)
    
    if project_id is not None:
        statement = statement.where(ApiUsage.project_id == project_id)
    if api_key_id is not None:
        statement = statement.where(ApiUsage.api_key_id == api_key_id)
    if start_date:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        statement = statement.where(ApiUsage.timestamp >= start)
    if end_date:
        end = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        statement = statement.where(ApiUsage.timestamp < end)
    
    statement = statement.order_by(ApiUsage.timestamp.desc()).offset(skip).limit(limit)
    records = session.exec(statement).all()
    return records

# --- API Key Routes ---

@router_frontend.get("/api/stats", response_model=ApiUsageStats)
async def get_api_key_stats(
    request: Request,
    user_project_key: tuple[User, Project, ApiKey] = Depends(get_api_key_user),
    session: Session = Depends(get_db),
    days: Optional[int] = 30
):
    """Get usage statistics for the current API key."""
    _, project, api_key = user_project_key
    
    # Calculate date range
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    # Query for statistics
    result = session.query(
        func.count(ApiUsage.id).label('api_calls'),
        func.avg(ApiUsage.response_time).label('avg_response_time'),
        (func.sum(case((ApiUsage.status_code < 400, 1), else_=0)) * 100.0 / func.count(ApiUsage.id)).label('success_rate')
    ).filter(
        and_(
            ApiUsage.api_key_id == api_key.id,
            ApiUsage.timestamp >= start_date,
            ApiUsage.timestamp <= end_date
        )
    ).first()
    
    return ApiUsageStats(
        date=str(end_date.date()),
        api_calls=result.api_calls,
        avg_response_time=float(result.avg_response_time or 0),
        success_rate=float(result.success_rate or 100.0)
    )
