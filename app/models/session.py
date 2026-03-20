"""Pydantic models para sesiones de chat."""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
from enum import Enum


class SessionType(str, Enum):
    GROUP = "group"
    DIRECT = "direct"


class VisualConfig(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None
    color: Optional[str] = None
    theme: Optional[str] = None
    bubble_color: Optional[str] = None
    secondary_color: Optional[str] = None


class ContextFile(BaseModel):
    file_id: str
    name: str
    vector_index_id: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SessionBase(BaseModel):
    session_id: str
    user_id: str = "default_user"
    title: str
    base_agent_id: str = "CEO"
    agent_ref_type: str = "core"
    type: SessionType = SessionType.DIRECT
    visual_config: VisualConfig = VisualConfig()
    context_files: List[ContextFile] = []
    enabled_tools: List[str] = []
    members: List[str] = []
    folder: Optional[str] = None
    tags: List[str] = []
    pinned_messages: List[str] = []
    created_at: datetime


class CreateSessionRequest(BaseModel):
    title: Optional[str] = "Nueva Estrategia"
    user_id: Optional[str] = "default_user"
    base_agent_id: Optional[str] = "CEO"
    agent_ref_type: Optional[str] = None
    type: Optional[SessionType] = None
    visual_config: Optional[VisualConfig] = None
    enabled_tools: Optional[List[str]] = None
    members: Optional[List[str]] = None


class UpdateSessionRequest(BaseModel):
    title: Optional[str] = None
    visual_config: Optional[VisualConfig] = None
    enabled_tools: Optional[List[str]] = None
    members: Optional[List[str]] = None
    folder: Optional[str] = None
    tags: Optional[List[str]] = None


class PinRequest(BaseModel):
    message_id: str


class RatingRequest(BaseModel):
    message_id: str
    rating: str
    feedback: Optional[str] = None
