from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import firebase_admin
from firebase_admin import credentials

# Local imports
from firebase.firebase_credentials import get_firebase_credentials
from database import create_db_and_tables, get_db
from models import User, UserRead
from auth import get_current_db_user
from routes.projects import router as projects_router, router_frontend as projects_frontend_router
from routes.api_keys import router as api_keys_router, router_frontend as api_keys_frontend_router
from routes.usage import router as usage_router, router_frontend as usage_frontend_router
from routes.files import router as files_router, router_frontend as files_frontend_router, router_public as files_public_router

# Initialize Firebase Admin SDK
try:
    firebase_creds_dict = get_firebase_credentials()
    cred = credentials.Certificate(firebase_creds_dict)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
        print("Firebase Admin SDK initialized successfully.")
    else:
        print("Firebase Admin SDK already initialized.")
except Exception as e:
    print(f"Error during Firebase Admin SDK initialization check: {e}")
    raise HTTPException(status_code=500, detail="Failed to initialize Firebase Admin SDK")

# Lifespan context manager for startup/shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Application startup: Creating database and tables...")
    create_db_and_tables()
    print("Database and tables created (if they didn't exist).")
    yield
    print("Application shutdown.")

app = FastAPI(
    lifespan=lifespan,
    title="OpenUpload API",
    description="API for managing file uploads, projects, and API keys",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include base routes (hidden from docs)
app.include_router(projects_router)
app.include_router(api_keys_router)
app.include_router(usage_router)

# Include API key routes (shown in docs)
app.include_router(files_router)

# Include public routes (shown in docs)
app.include_router(files_public_router)

# Include frontend routes (hidden from docs)
app.include_router(projects_frontend_router)
app.include_router(api_keys_frontend_router)
app.include_router(usage_frontend_router)
app.include_router(files_frontend_router)

# Root route
@app.get("/")
async def root():
    return {"message": "OpenUpload Backend API"}

# User profile route (requires authentication, hidden from docs)
@app.get("/me", response_model=UserRead, include_in_schema=False)
async def read_users_me(current_user: User = Depends(get_current_db_user)):
    """Returns the authenticated user's profile from the database."""
    return current_user

# Main execution
if __name__ == "__main__":
    import uvicorn
    print(f"Starting server, allowing origins: {os.getenv('FRONTEND_URL')}")
    print(f"Using database: {os.getenv('DATABASE_URL', 'sqlite:///./database.db')}")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
