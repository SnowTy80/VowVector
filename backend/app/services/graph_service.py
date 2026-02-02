import json
from datetime import datetime, timezone

from app.core.connections import get_neo4j_driver
from app.models.node import (
    LinkCreate,
    LinkResponse,
    NodeCreate,
    NodeResponse,
    NodeType,
    NodeUpdate,
    RelationshipType,
)


def _node_to_response(record: dict) -> NodeResponse:
    """Convert a Neo4j node record to a NodeResponse."""
    return NodeResponse(
        id=record["id"],
        title=record["title"],
        content=record["content"],
        node_type=record["node_type"],
        tags=record.get("tags", []),
        metadata=json.loads(record.get("metadata", "{}")) if isinstance(record.get("metadata"), str) else record.get("metadata", {}),
        created_at=record["created_at"],
        updated_at=record["updated_at"],
    )


async def create_node(node: NodeCreate) -> NodeResponse:
    """Create a node in Neo4j and return its data."""
    driver = await get_neo4j_driver()
    now = datetime.now(timezone.utc).isoformat()
    node_id = f"{node.node_type.value.lower()}_{now.replace(':', '-').replace('.', '-').replace('+', 'p')}"

    query = f"""
    CREATE (n:{node.node_type.value} {{
        id: $id,
        title: $title,
        content: $content,
        node_type: $node_type,
        tags: $tags,
        metadata: $metadata,
        created_at: $created_at,
        updated_at: $updated_at
    }})
    RETURN n {{
        .id, .title, .content, .node_type, .tags,
        .metadata, .created_at, .updated_at
    }} AS node
    """

    async with driver.session() as session:
        result = await session.run(
            query,
            id=node_id,
            title=node.title,
            content=node.content,
            node_type=node.node_type.value,
            tags=node.tags,
            metadata=json.dumps(node.metadata),
            created_at=now,
            updated_at=now,
        )
        record = await result.single()
        return _node_to_response(record["node"])


async def get_node(node_id: str) -> NodeResponse | None:
    """Get a single node by ID."""
    driver = await get_neo4j_driver()

    query = """
    MATCH (n {id: $id})
    RETURN n {
        .id, .title, .content, .node_type, .tags,
        .metadata, .created_at, .updated_at
    } AS node
    """

    async with driver.session() as session:
        result = await session.run(query, id=node_id)
        record = await result.single()
        if record is None:
            return None
        return _node_to_response(record["node"])


async def update_node(node_id: str, update: NodeUpdate) -> NodeResponse | None:
    """Update an existing node."""
    driver = await get_neo4j_driver()
    now = datetime.now(timezone.utc).isoformat()

    set_clauses = ["n.updated_at = $updated_at"]
    params: dict = {"id": node_id, "updated_at": now}

    if update.title is not None:
        set_clauses.append("n.title = $title")
        params["title"] = update.title
    if update.content is not None:
        set_clauses.append("n.content = $content")
        params["content"] = update.content
    if update.tags is not None:
        set_clauses.append("n.tags = $tags")
        params["tags"] = update.tags
    if update.metadata is not None:
        set_clauses.append("n.metadata = $metadata")
        params["metadata"] = json.dumps(update.metadata)

    query = f"""
    MATCH (n {{id: $id}})
    SET {', '.join(set_clauses)}
    RETURN n {{
        .id, .title, .content, .node_type, .tags,
        .metadata, .created_at, .updated_at
    }} AS node
    """

    async with driver.session() as session:
        result = await session.run(query, **params)
        record = await result.single()
        if record is None:
            return None
        return _node_to_response(record["node"])


async def delete_node(node_id: str) -> bool:
    """Delete a node and all its relationships."""
    driver = await get_neo4j_driver()

    query = """
    MATCH (n {id: $id})
    DETACH DELETE n
    RETURN count(n) AS deleted
    """

    async with driver.session() as session:
        result = await session.run(query, id=node_id)
        record = await result.single()
        return record["deleted"] > 0


async def list_nodes(
    node_type: NodeType | None = None,
    skip: int = 0,
    limit: int = 50,
) -> list[NodeResponse]:
    """List nodes with optional type filter and pagination."""
    driver = await get_neo4j_driver()

    if node_type:
        query = f"""
        MATCH (n:{node_type.value})
        RETURN n {{
            .id, .title, .content, .node_type, .tags,
            .metadata, .created_at, .updated_at
        }} AS node
        ORDER BY n.created_at DESC
        SKIP $skip LIMIT $limit
        """
    else:
        query = """
        MATCH (n)
        WHERE n.id IS NOT NULL
        RETURN n {
            .id, .title, .content, .node_type, .tags,
            .metadata, .created_at, .updated_at
        } AS node
        ORDER BY n.created_at DESC
        SKIP $skip LIMIT $limit
        """

    async with driver.session() as session:
        result = await session.run(query, skip=skip, limit=limit)
        records = await result.data()
        return [_node_to_response(r["node"]) for r in records]


async def create_link(source_id: str, link: LinkCreate) -> LinkResponse | None:
    """Create a relationship between two nodes."""
    driver = await get_neo4j_driver()

    query = f"""
    MATCH (a {{id: $source_id}}), (b {{id: $target_id}})
    CREATE (a)-[r:{link.relationship.value} $props]->(b)
    RETURN a.id AS source_id, b.id AS target_id,
           type(r) AS relationship
    """

    async with driver.session() as session:
        result = await session.run(
            query,
            source_id=source_id,
            target_id=link.target_id,
            props=link.properties,
        )
        record = await result.single()
        if record is None:
            return None
        return LinkResponse(
            source_id=record["source_id"],
            target_id=record["target_id"],
            relationship=record["relationship"],
            properties=link.properties,
        )


async def delete_link(
    source_id: str,
    target_id: str,
    relationship: str | None = None,
) -> bool:
    """Delete a relationship between two nodes."""
    driver = await get_neo4j_driver()

    if relationship:
        # Validate against known relationship types to prevent Cypher injection
        valid_types = {rt.value for rt in RelationshipType}
        if relationship not in valid_types:
            return False
        query = f"""
        MATCH (a {{id: $source_id}})-[r:{relationship}]->(b {{id: $target_id}})
        DELETE r
        RETURN count(r) AS deleted
        """
    else:
        query = """
        MATCH (a {id: $source_id})-[r]->(b {id: $target_id})
        DELETE r
        RETURN count(r) AS deleted
        """

    async with driver.session() as session:
        result = await session.run(
            query,
            source_id=source_id,
            target_id=target_id,
        )
        record = await result.single()
        return record["deleted"] > 0


async def get_graph_data() -> dict:
    """Get all nodes and relationships for visualization."""
    driver = await get_neo4j_driver()

    nodes_query = """
    MATCH (n)
    WHERE n.id IS NOT NULL
    RETURN n {
        .id, .title, .content, .node_type, .tags,
        .metadata, .created_at, .updated_at
    } AS node
    """

    links_query = """
    MATCH (a)-[r]->(b)
    WHERE a.id IS NOT NULL AND b.id IS NOT NULL
    RETURN a.id AS source_id, b.id AS target_id,
           type(r) AS relationship, properties(r) AS properties
    """

    async with driver.session() as session:
        nodes_result = await session.run(nodes_query)
        nodes_data = await nodes_result.data()
        nodes = [_node_to_response(r["node"]) for r in nodes_data]

        links_result = await session.run(links_query)
        links_data = await links_result.data()
        links = [
            LinkResponse(
                source_id=r["source_id"],
                target_id=r["target_id"],
                relationship=r["relationship"],
                properties=r.get("properties", {}),
            )
            for r in links_data
        ]

    return {"nodes": nodes, "links": links}
