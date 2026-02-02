import uuid

from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue

from app.core.connections import get_qdrant_client
from app.models.node import NODE_TYPE_TO_COLLECTION, NodeType


def upsert_vector(
    node_id: str,
    node_type: NodeType,
    embedding: list[float],
    title: str,
    tags: list[str],
    created_at: str,
    chunk_index: int | None = None,
    chunk_count: int | None = None,
) -> bool:
    """Store an embedding vector in the appropriate Qdrant collection."""
    collection = NODE_TYPE_TO_COLLECTION.get(node_type)
    if collection is None:
        return False

    client = get_qdrant_client()
    chunk_suffix = f":{chunk_index}" if chunk_index is not None else ""
    point = PointStruct(
        id=str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{node_id}{chunk_suffix}")),
        vector=embedding,
        payload={
            "node_id": node_id,
            "title": title,
            "tags": tags,
            "type": node_type.value,
            "created_at": created_at,
            "chunk_index": chunk_index,
            "chunk_count": chunk_count,
        },
    )
    client.upsert(collection_name=collection, points=[point])
    return True


def delete_vector(node_id: str, node_type: NodeType) -> bool:
    """Remove a vector from Qdrant by node_id."""
    collection = NODE_TYPE_TO_COLLECTION.get(node_type)
    if collection is None:
        return False

    client = get_qdrant_client()
    query_filter = Filter(
        must=[FieldCondition(key="node_id", match=MatchValue(value=node_id))]
    )
    client.delete(
        collection_name=collection,
        points_selector=query_filter,
    )
    return True


def search_vectors(
    embedding: list[float],
    node_type: NodeType | None = None,
    tags: list[str] | None = None,
    limit: int = 10,
) -> list[dict]:
    """Search for similar vectors across collections."""
    client = get_qdrant_client()
    results = []

    # Determine which collections to search
    if node_type:
        collection = NODE_TYPE_TO_COLLECTION.get(node_type)
        collections = [collection] if collection else []
    else:
        collections = list({c for c in NODE_TYPE_TO_COLLECTION.values() if c})

    for collection_name in collections:
        # Build filter
        conditions = []
        if tags:
            for tag in tags:
                conditions.append(
                    FieldCondition(key="tags", match=MatchValue(value=tag))
                )

        query_filter = Filter(must=conditions) if conditions else None

        hits = client.query_points(
            collection_name=collection_name,
            query=embedding,
            query_filter=query_filter,
            limit=limit,
        ).points

        for hit in hits:
            results.append({
                "node_id": hit.payload["node_id"],
                "title": hit.payload["title"],
                "score": hit.score,
                "type": hit.payload.get("type", ""),
                "tags": hit.payload.get("tags", []),
            })

    # Sort by score descending and limit
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:limit]
