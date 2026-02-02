from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class NodeType(str, Enum):
    NOTE = "Note"
    CODE = "Code"
    AI_INTERACTION = "AIInteraction"
    RESEARCH = "Research"
    PROJECT = "Project"
    CONCEPT = "Concept"
    TAG = "Tag"
    TOPIC = "Topic"


class RelationshipType(str, Enum):
    RELATES_TO = "RELATES_TO"
    IMPLEMENTS = "IMPLEMENTS"
    GENERATED = "GENERATED"
    SUPPORTS = "SUPPORTS"
    BELONGS_TO = "BELONGS_TO"
    HAS_TAG = "HAS_TAG"
    INSPIRED_BY = "INSPIRED_BY"
    REVISION_OF = "REVISION_OF"


# Map node types to Qdrant collection names
NODE_TYPE_TO_COLLECTION = {
    NodeType.NOTE: "notes",
    NodeType.CODE: "code",
    NodeType.AI_INTERACTION: "ai_interactions",
    NodeType.RESEARCH: "research",
    # These types don't get embeddings stored
    NodeType.PROJECT: None,
    NodeType.CONCEPT: "notes",
    NodeType.TAG: None,
    NodeType.TOPIC: None,
}


class NodeCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1)
    node_type: NodeType = NodeType.NOTE
    tags: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class NodeUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    content: Optional[str] = Field(None, min_length=1)
    tags: Optional[list[str]] = None
    metadata: Optional[dict] = None


class NodeResponse(BaseModel):
    id: str
    title: str
    content: str
    node_type: NodeType
    tags: list[str] = []
    metadata: dict = {}
    created_at: str
    updated_at: str


class LinkCreate(BaseModel):
    target_id: str
    relationship: RelationshipType = RelationshipType.RELATES_TO
    properties: dict = Field(default_factory=dict)


class LinkResponse(BaseModel):
    source_id: str
    target_id: str
    relationship: str
    properties: dict = {}


class GraphData(BaseModel):
    nodes: list[NodeResponse] = []
    links: list[LinkResponse] = []
