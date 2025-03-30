from sqlmodel import SQLModel, create_engine, Session
from contextlib import contextmanager
import os
from dotenv import load_dotenv

# Import all models to ensure they're registered with SQLModel metadata
from models import User, Project, ApiKey, ApiUsage, File

load_dotenv()

# Use environment variable or default to a file named 'database.db' in the db directory
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./db/database.db")

# The connect_args is needed only for SQLite to disable same-thread checking.
# It's not needed for other databases.
engine = create_engine(DATABASE_URL, echo=True, connect_args={"check_same_thread": False})

def create_db_and_tables():
    """Creates the database and all tables defined in SQLModel metadata."""
    # This is typically called once at application startup.
    # For production, Alembic migrations are preferred.
    SQLModel.metadata.create_all(engine)

@contextmanager
def get_session():
    """Provide a transactional scope around a series of operations."""
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

# Dependency for FastAPI routes to get a database session
def get_db():
    """FastAPI dependency to get a database session."""
    with get_session() as session:
        yield session
