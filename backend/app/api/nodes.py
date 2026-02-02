from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.connections import get_neo4j_driver
from app.models.node import (
    GraphData,
    LinkCreate,
    LinkResponse,
    NodeCreate,
    NodeResponse,
    NodeType,
    NodeUpdate,
)
from app.services import embedding_service, graph_service, vector_service
from app.utils.text_processor import chunk_text

router = APIRouter(prefix="/nodes", tags=["nodes"])


@router.post("", response_model=NodeResponse, status_code=201)
async def create_node(node: NodeCreate):
    """Create a new knowledge node with graph entry and vector embedding."""
    ctx_size = len(node.content)
    ctx_bucket = "small" if ctx_size <= 3000 else "medium" if ctx_size <= 9000 else "large"
    chunks = chunk_text(f"{node.title}\n\n{node.content}")
    chunk_count = len(chunks) if chunks else 1
    metadata = dict(node.metadata)
    metadata.update({
        "ctx_size": ctx_size,
        "ctx_bucket": ctx_bucket,
        "chunk_count": chunk_count,
        "chunked": chunk_count > 1,
    })
    node = node.model_copy(update={"metadata": metadata})
    # 1. Create node in Neo4j
    created = await graph_service.create_node(node)

    # 2. Generate embedding and store in Qdrant
    try:
        text = f"{node.title}\n\n{node.content}"
        chunks = chunk_text(text)
        if not chunks:
            chunks = [text]
        for idx, chunk in enumerate(chunks):
            embedding = await embedding_service.generate_embedding(chunk)
            vector_service.upsert_vector(
                node_id=created.id,
                node_type=node.node_type,
                embedding=embedding,
                title=node.title,
                tags=node.tags,
                created_at=created.created_at,
                chunk_index=idx,
                chunk_count=len(chunks),
            )
    except Exception as e:
        # Node exists in graph but embedding failed — log but don't fail
        print(f"WARNING: Embedding failed for {created.id}: {e}")

    return created


@router.get("", response_model=list[NodeResponse])
async def list_nodes(
    node_type: NodeType | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """List nodes with optional type filter and pagination."""
    return await graph_service.list_nodes(node_type=node_type, skip=skip, limit=limit)


@router.get("/{node_id}", response_model=NodeResponse)
async def get_node(node_id: str):
    """Get a node by ID."""
    node = await graph_service.get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.put("/{node_id}", response_model=NodeResponse)
async def update_node(node_id: str, update: NodeUpdate):
    """Update a node's content and re-generate its embedding."""
    # Get existing node to know its type
    existing = await graph_service.get_node(node_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Node not found")

    # Re-generate embedding if content or title changed
    if update.content is not None or update.title is not None:
        try:
            title = update.title or existing.title
            content = update.content or existing.content
            text = f"{title}\n\n{content}"
            chunks = chunk_text(text)
            if not chunks:
                chunks = [text]
            vector_service.delete_vector(node_id, existing.node_type)
            for idx, chunk in enumerate(chunks):
                embedding = await embedding_service.generate_embedding(chunk)
                vector_service.upsert_vector(
                    node_id=node_id,
                    node_type=existing.node_type,
                    embedding=embedding,
                    title=title,
                    tags=update.tags or existing.tags,
                    created_at=existing.created_at,
                    chunk_index=idx,
                    chunk_count=len(chunks),
                )
            ctx_size = len(content)
            ctx_bucket = "small" if ctx_size <= 3000 else "medium" if ctx_size <= 9000 else "large"
            # Merge: start from existing, layer on frontend-sent metadata, then apply computed fields
            metadata = dict(existing.metadata or {})
            if update.metadata is not None:
                metadata.update(update.metadata)
            metadata.update({
                "ctx_size": ctx_size,
                "ctx_bucket": ctx_bucket,
                "chunk_count": len(chunks),
                "chunked": len(chunks) > 1,
            })
            update.metadata = metadata
        except Exception as e:
            print(f"WARNING: Re-embedding failed for {node_id}: {e}")

    # Update in Neo4j
    updated = await graph_service.update_node(node_id, update)
    return updated


@router.delete("/{node_id}", status_code=204)
async def delete_node(node_id: str):
    """Delete a node from both Neo4j and Qdrant."""
    existing = await graph_service.get_node(node_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Node not found")

    # Delete from Qdrant
    vector_service.delete_vector(node_id, existing.node_type)

    # Delete from Neo4j
    await graph_service.delete_node(node_id)


@router.post("/{node_id}/link", response_model=LinkResponse, status_code=201)
async def create_link(node_id: str, link: LinkCreate):
    """Create a relationship between two nodes."""
    result = await graph_service.create_link(node_id, link)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Source or target node not found",
        )
    return result


@router.delete("/{node_id}/link", status_code=204)
async def delete_link(
    node_id: str,
    target_id: str = Query(..., min_length=1),
    relationship: str | None = Query(None),
):
    """Delete a relationship between two nodes."""
    deleted = await graph_service.delete_link(
        source_id=node_id,
        target_id=target_id,
        relationship=relationship,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Link not found")


@router.delete("/conversations/purge", status_code=200)
async def purge_conversations():
    """Bulk-delete all imported conversation nodes, month-cluster Topics,
    and their parent Project group from Neo4j and Qdrant."""
    driver = await get_neo4j_driver()
    deleted_ids = []

    # 1. Collect all AIInteraction nodes
    ai_query = """
    MATCH (n:AIInteraction)
    RETURN n.id AS id
    """
    # 2. Collect month-cluster Topic nodes
    month_query = """
    MATCH (n:Topic)
    WHERE 'month-cluster' IN n.tags
    RETURN n.id AS id
    """
    # 3. Collect Project group nodes that parent conversation data
    # Find Projects linked to by month-cluster Topics or AIInteraction nodes
    project_query = """
    MATCH (child)-[:BELONGS_TO]->(n:Project)
    WHERE child:Topic OR child:AIInteraction
    RETURN DISTINCT n.id AS id
    """

    async with driver.session() as session:
        for query in [ai_query, month_query, project_query]:
            result = await session.run(query)
            records = await result.data()
            for r in records:
                deleted_ids.append(r["id"])

    # Delete vectors from Qdrant for AIInteraction nodes
    for node_id in deleted_ids:
        if node_id.startswith("aiinteraction_"):
            vector_service.delete_vector(node_id, NodeType.AI_INTERACTION)

    # Bulk delete from Neo4j
    if deleted_ids:
        async with driver.session() as session:
            await session.run(
                "MATCH (n) WHERE n.id IN $ids DETACH DELETE n",
                ids=deleted_ids,
            )

    return {"deleted": len(deleted_ids), "node_ids": deleted_ids[:20]}


class BulkDeleteRequest(BaseModel):
    node_ids: list[str]


class BulkTagRequest(BaseModel):
    node_ids: list[str]
    tags: list[str]


@router.post("/bulk/delete", status_code=200)
async def bulk_delete_nodes(req: BulkDeleteRequest):
    """Bulk-delete nodes by ID from Neo4j and Qdrant."""
    deleted = 0
    for node_id in req.node_ids:
        existing = await graph_service.get_node(node_id)
        if existing is None:
            continue
        vector_service.delete_vector(node_id, existing.node_type)
        await graph_service.delete_node(node_id)
        deleted += 1
    return {"deleted": deleted}


@router.post("/bulk/tag", status_code=200)
async def bulk_tag_nodes(req: BulkTagRequest):
    """Append tags to multiple nodes."""
    driver = await get_neo4j_driver()
    updated = 0
    async with driver.session() as session:
        for node_id in req.node_ids:
            result = await session.run(
                "MATCH (n {id: $id}) RETURN n.tags AS tags",
                id=node_id,
            )
            record = await result.single()
            if record is None:
                continue
            existing_tags = list(record["tags"] or [])
            merged = list(dict.fromkeys(existing_tags + req.tags))
            await session.run(
                "MATCH (n {id: $id}) SET n.tags = $tags",
                id=node_id,
                tags=merged,
            )
            updated += 1
    return {"updated": updated}


graph_router = APIRouter(tags=["graph"])


@graph_router.get("/graph", response_model=GraphData)
async def get_graph():
    """Get all nodes and relationships for 3D visualization."""
    data = await graph_service.get_graph_data()
    return data
