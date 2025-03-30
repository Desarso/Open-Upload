from fastapi import APIRouter, Depends
from auth import get_current_db_user
from helpers.Firebase_helpers import role_based_access

# Base router for Firebase authenticated routes (hidden from docs)
router_base = APIRouter(include_in_schema=False)
router_base.dependencies.append(Depends(get_current_db_user))

# Frontend router for Firebase authenticated routes (hidden from docs)
router_frontend = APIRouter(prefix="/frontend", include_in_schema=False)
router_frontend.dependencies.append(Depends(get_current_db_user))

# API key router for routes requiring API key authentication (shown in docs)
router_api = APIRouter(prefix="/api/v1", tags=["API"])
