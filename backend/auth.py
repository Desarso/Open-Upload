from fastapi import Depends, HTTPException, status, Security
from fastapi.security import APIKeyHeader
from sqlmodel import Session, select
from datetime import datetime

# Use absolute imports assuming 'backend' is the package root
from database import get_db
from models import User, ApiKey, Project
from helpers.Firebase_helpers import get_current_user, FirebaseUser

# API Key header
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def get_api_key_user(
    api_key: str = Security(api_key_header),
    session: Session = Depends(get_db)
) -> tuple[User, Project, ApiKey]:
    """
    Validates the API key and returns the associated user, project, and API key.
    Raises HTTPException if the key is invalid or inactive.
    """
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key is required",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Query for the API key and its relationships
    statement = select(ApiKey).where(ApiKey.key == api_key, ApiKey.is_active == True)
    db_key = session.exec(statement).first()

    if not db_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Update last_used_at
    db_key.last_used_at = datetime.utcnow()
    session.add(db_key)
    session.commit()

    # Get associated user and project
    user = session.get(User, db_key.user_firebase_uid)
    project = session.get(Project, db_key.project_id)

    if not user or not project:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key is invalid (missing user or project)",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    return user, project, db_key

async def get_current_db_user(
    session: Session = Depends(get_db),
    firebase_user: FirebaseUser = Depends(get_current_user)
) -> User:
    """
    FastAPI dependency that:
    1. Verifies the Firebase token using get_current_user.
    2. Fetches the corresponding User from the local database.
    3. Creates the User in the local database if it doesn't exist.
    Returns the SQLModel User object.
    """
    # Check if user exists in our database
    statement = select(User).where(User.firebase_uid == firebase_user.uid)
    db_user = session.exec(statement).first()

    if db_user:
        # Optional: Update email if it has changed in Firebase?
        # if db_user.email != firebase_user.email:
        #     db_user.email = firebase_user.email
        #     session.add(db_user)
        #     session.commit()
        #     session.refresh(db_user)
        return db_user
    else:
        # User exists in Firebase but not in our DB, create them
        new_user = User(
            firebase_uid=firebase_user.uid,
            email=firebase_user.email
            # created_at is handled by default_factory
        )
        session.add(new_user)
        try:
            session.commit()
            session.refresh(new_user)
            return new_user
        except Exception as e:
            session.rollback()
            # Handle potential race conditions or unique constraint violations if needed
            print(f"Error creating user in DB: {e}") # Log the error
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not create user profile in the database.",
            )

# You can keep using the role_based_access from Firebase_helpers for role checks,
# as it operates on Firebase claims. Endpoints needing the DB user object
# should use Depends(get_current_db_user).
