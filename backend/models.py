from typing import List, Optional
from sqlmodel import Field, Relationship, SQLModel
import datetime
import uuid

# Using Firebase UID as the primary key for User
class UserBase(SQLModel):
    firebase_uid: str = Field(index=True, unique=True, primary_key=True)
    email: str = Field(index=True, unique=True)
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

class User(UserBase, table=True):
    projects: List["Project"] = Relationship(back_populates="user")
    api_keys: List["ApiKey"] = Relationship(back_populates="user")
    usage_records: List["ApiUsage"] = Relationship(back_populates="user")
    files: List["File"] = Relationship(back_populates="user")

class UserRead(UserBase):
    pass # No need to expose relationships by default

# --- Project Model ---

class ProjectBase(SQLModel):
    name: str = Field(index=True)
    description: Optional[str] = None
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
    # Foreign Key to User
    user_firebase_uid: str = Field(foreign_key="user.firebase_uid", index=True)

class Project(ProjectBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # Relationships
    user: User = Relationship(back_populates="projects")
    api_keys: List["ApiKey"] = Relationship(back_populates="project")
    usage_records: List["ApiUsage"] = Relationship(back_populates="project")
    files: List["File"] = Relationship(back_populates="project")

class ProjectCreate(ProjectBase):
    pass

class ProjectRead(ProjectBase):
    id: int
    created_at: datetime.datetime

class ProjectReadWithKeys(ProjectRead):
    api_keys: List["ApiKeyRead"] = []

# --- ApiKey Model ---

def generate_api_key():
    """Generates a unique API key."""
    # Example: "openupload_sk_..." (sk for secret key)
    return f"openupload_sk_{uuid.uuid4().hex}"

class ApiKeyBase(SQLModel):
    key: str = Field(default_factory=generate_api_key, index=True, unique=True)
    is_active: bool = Field(default=True)
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
    last_used_at: Optional[datetime.datetime] = Field(default=None)
    # Foreign Keys
    user_firebase_uid: str = Field(foreign_key="user.firebase_uid", index=True)
    project_id: int = Field(foreign_key="project.id", index=True)

class ApiKey(ApiKeyBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # Relationships
    user: User = Relationship(back_populates="api_keys")
    project: Project = Relationship(back_populates="api_keys")
    usage_records: List["ApiUsage"] = Relationship(back_populates="api_key")

class ApiKeyCreate(SQLModel):
    # Only need project_id when creating, user_id comes from auth
    project_id: int

class ApiKeyRead(ApiKeyBase):
    id: int
    project_id: int # Include project_id for clarity

# --- API Usage Model ---

class ApiUsageBase(SQLModel):
    timestamp: datetime.datetime = Field(default_factory=datetime.datetime.utcnow, index=True)
    endpoint: str = Field(index=True)
    response_time: float  # in milliseconds
    status_code: int
    # Foreign Keys
    user_firebase_uid: str = Field(foreign_key="user.firebase_uid", index=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    api_key_id: int = Field(foreign_key="apikey.id", index=True)

class ApiUsage(ApiUsageBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # Relationships
    user: User = Relationship(back_populates="usage_records")
    project: Project = Relationship(back_populates="usage_records")
    api_key: ApiKey = Relationship(back_populates="usage_records")

class ApiUsageRead(ApiUsageBase):
    id: int

class ApiUsageStats(SQLModel):
    date: str
    api_calls: int
    avg_response_time: float
    success_rate: float

# --- File Model ---

class FileBase(SQLModel):
    filename: str = Field(index=True)
    size: int  # in bytes
    mime_type: str
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
    # Foreign Keys
    project_id: int = Field(foreign_key="project.id", index=True)
    user_firebase_uid: str = Field(foreign_key="user.firebase_uid", index=True)

class File(FileBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    storage_path: str  # Path where file is stored
    # Relationships
    project: Project = Relationship(back_populates="files")
    user: User = Relationship(back_populates="files")

class FileCreate(SQLModel):
    filename: str
    size: int
    mime_type: str
    project_id: int

class FileRead(FileBase):
    id: int
    created_at: datetime.datetime

# Update forward refs allows relationships to be defined using strings before the class is defined
ProjectReadWithKeys.model_rebuild()
