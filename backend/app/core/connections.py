from neo4j import AsyncGraphDatabase
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from app.core.config import settings

# Qdrant collection names mapped to node types
QDRANT_COLLECTIONS = {
    "notes": "notes",
    "code": "code",
    "research": "research",
    "ai_interactions": "ai_interactions",
}

# Neo4j async driver (singleton)
_neo4j_driver = None

# Qdrant client (singleton)
_qdrant_client = None


async def get_neo4j_driver():
    global _neo4j_driver
    if _neo4j_driver is None:
        _neo4j_driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
    return _neo4j_driver


async def close_neo4j_driver():
    global _neo4j_driver
    if _neo4j_driver is not None:
        await _neo4j_driver.close()
        _neo4j_driver = None


def get_qdrant_client() -> QdrantClient:
    global _qdrant_client
    if _qdrant_client is None:
        _qdrant_client = QdrantClient(
            host=settings.qdrant_host, port=settings.qdrant_port
        )
    return _qdrant_client


def init_qdrant_collections():
    """Create Qdrant collections if they don't exist."""
    client = get_qdrant_client()
    existing = {c.name for c in client.get_collections().collections}

    for collection_name in QDRANT_COLLECTIONS.values():
        if collection_name not in existing:
            client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=settings.embedding_dim,
                    distance=Distance.COSINE,
                ),
            )
