"""Batch conversation import and tag-based connection endpoints."""

import asyncio
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter

from app.core.connections import get_neo4j_driver
from app.models.node import (
    ConversationBatchRequest,
    ConversationBatchResponse,
    ConnectRequest,
    ConnectResponse,
    LinkCreate,
    NodeCreate,
    NodeType,
    RelationshipType,
)
from app.services import embedding_service, graph_service, vector_service
from app.services.conversation_tagger import extract_conversation_tags
from app.utils.text_processor import chunk_text

router = APIRouter(prefix="/conversations", tags=["conversations"])

# Concurrency limit for embedding calls
_EMBED_SEMAPHORE = asyncio.Semaphore(5)


def _format_content(convo) -> str:
    """Format conversation messages as readable markdown."""
    lines = []
    if convo.title:
        lines.append(f"# {convo.title}\n")
    if convo.create_time:
        dt = datetime.fromtimestamp(convo.create_time, tz=timezone.utc)
        lines.append(f"Date: {dt.strftime('%Y-%m-%d %H:%M:%S UTC')}\n")
    lines.append("---\n")
    for msg in convo.messages:
        role = "USER" if msg.role == "user" else "ASSISTANT"
        lines.append(f"**[{role}]**")
        lines.append(msg.text or "")
        lines.append("")
    return "\n".join(lines)


def _month_key(unix_time: float | None) -> str:
    if not unix_time:
        return "undated"
    dt = datetime.fromtimestamp(unix_time, tz=timezone.utc)
    return f"{dt.year}-{dt.month:02d}"


def _msg_scale(msg_count: int) -> float:
    import math
    raw = 0.5 + math.log2(max(1, msg_count)) * 0.3
    return min(2.0, max(0.5, raw))


async def _embed_node(node_id: str, title: str, content: str, tags: list[str], created_at: str):
    """Generate embedding and store in Qdrant with concurrency limit."""
    async with _EMBED_SEMAPHORE:
        try:
            text = f"{title}\n\n{content}"
            chunks = chunk_text(text)
            if not chunks:
                chunks = [text]
            for idx, chunk in enumerate(chunks):
                embedding = await embedding_service.generate_embedding(chunk)
                vector_service.upsert_vector(
                    node_id=node_id,
                    node_type=NodeType.AI_INTERACTION,
                    embedding=embedding,
                    title=title,
                    tags=tags,
                    created_at=created_at,
                    chunk_index=idx,
                    chunk_count=len(chunks),
                )
        except Exception as e:
            print(f"WARNING: Embedding failed for {node_id}: {e}")


@router.post("/import", response_model=ConversationBatchResponse, status_code=201)
async def import_conversations(req: ConversationBatchRequest):
    """Import a batch of conversations with auto-tagging.

    Creates AIInteraction nodes, month Topic clusters, and a Project
    group node. Auto-generates content-based tags per conversation.
    """
    imported = 0
    failed = 0
    errors: list[str] = []
    tag_counter: Counter = Counter()
    month_node_map: dict[str, str] = {}  # month_key -> node_id
    project_id: str | None = None

    # Create project group node if group_name provided
    if req.group_name:
        try:
            proj_node = await graph_service.create_node(NodeCreate(
                title=req.group_name,
                content=f"Folder group: {req.group_name}",
                node_type=NodeType.PROJECT,
                tags=["group", "folder", f"group:{req.group_name}"],
                metadata={
                    "source": "folder-group",
                    "group_name": req.group_name,
                    "project_scale": req.group_scale,
                    "project_color": req.group_color,
                },
            ))
            project_id = proj_node.id
        except Exception as e:
            errors.append(f"Failed to create project node: {e}")

    embed_tasks = []

    for convo in req.conversations:
        try:
            # Build message dicts for tagger
            msg_dicts = [{"role": m.role, "text": m.text} for m in convo.messages]

            # Auto-tag
            content_tags = extract_conversation_tags(convo.title, msg_dicts)
            for t in content_tags:
                tag_counter[t] += 1

            # Structural tags
            msg_count = len(convo.messages)
            month = _month_key(convo.create_time)
            user_msg_count = sum(1 for m in convo.messages if m.role == "user")
            scale = _msg_scale(msg_count)

            tags = [
                "conversation",
                "imported",
                "type:aiinteraction",
                f"month:{month}",
                f"messages:{msg_count}",
                *content_tags,
                *req.user_tags,
            ]
            if req.group_name:
                tags.append(f"group:{req.group_name}")

            # Deduplicate tags
            seen: set[str] = set()
            unique_tags: list[str] = []
            for t in tags:
                if t not in seen:
                    seen.add(t)
                    unique_tags.append(t)

            content = _format_content(convo)

            metadata: dict = {
                "source": "conversation-import",
                "conversation_id": convo.conversation_id,
                "message_count": msg_count,
                "user_messages": user_msg_count,
                "assistant_messages": msg_count - user_msg_count,
                "node_scale": scale,
                "original_file": convo.original_file,
            }
            if convo.create_time:
                metadata["conversation_created"] = datetime.fromtimestamp(
                    convo.create_time, tz=timezone.utc
                ).isoformat()
            if convo.update_time:
                metadata["conversation_updated"] = datetime.fromtimestamp(
                    convo.update_time, tz=timezone.utc
                ).isoformat()

            node = await graph_service.create_node(NodeCreate(
                title=convo.title or convo.original_file.replace(".json", ""),
                content=content,
                node_type=NodeType.AI_INTERACTION,
                tags=unique_tags,
                metadata=metadata,
            ))

            # Schedule embedding generation
            embed_tasks.append(
                _embed_node(node.id, node.title, content, unique_tags, node.created_at)
            )

            # Link to month Topic node
            if month not in month_node_map:
                try:
                    month_node = await graph_service.create_node(NodeCreate(
                        title=month,
                        content=f"Conversation history — {month}",
                        node_type=NodeType.TOPIC,
                        tags=["month-cluster", "conversation-history", f"month:{month}"],
                        metadata={"source": "month-cluster", "month": month},
                    ))
                    month_node_map[month] = month_node.id
                    if project_id:
                        await graph_service.create_link(
                            month_node.id,
                            LinkCreate(
                                target_id=project_id,
                                relationship=RelationshipType.BELONGS_TO,
                            ),
                        )
                except Exception:
                    pass

            month_id = month_node_map.get(month)
            if month_id:
                await graph_service.create_link(
                    node.id,
                    LinkCreate(
                        target_id=month_id,
                        relationship=RelationshipType.BELONGS_TO,
                    ),
                )

            imported += 1

        except Exception as e:
            failed += 1
            errors.append(f"{convo.original_file or convo.title}: {e}")

    # Run embeddings concurrently (limited by semaphore)
    if embed_tasks:
        await asyncio.gather(*embed_tasks, return_exceptions=True)

    return ConversationBatchResponse(
        imported=imported,
        failed=failed,
        tag_summary=dict(tag_counter.most_common(50)),
        errors=errors[:20],
    )


@router.post("/connect", response_model=ConnectResponse, status_code=200)
async def connect_conversations(req: ConnectRequest):
    """Build RELATES_TO connections between AIInteraction nodes based on shared tags.

    Queries all AIInteraction nodes, finds pairs sharing >= threshold
    content tags (topic:, domain:, intent: prefixed), and creates
    RELATES_TO edges in a single batch Cypher query.
    """
    driver = await get_neo4j_driver()
    tag_prefixes = ("topic:", "domain:", "intent:")

    # Fetch all AIInteraction node IDs and their tags
    query = """
    MATCH (n:AIInteraction)
    RETURN n.id AS id, n.tags AS tags
    """
    async with driver.session() as session:
        result = await session.run(query)
        records = await result.data()

    # Build tag index
    node_tags: dict[str, set[str]] = {}
    tag_index: dict[str, list[str]] = defaultdict(list)

    for r in records:
        nid = r["id"]
        tags = r.get("tags") or []
        content_tags = {t for t in tags if t.startswith(tag_prefixes)}
        node_tags[nid] = content_tags
        for t in content_tags:
            tag_index[t].append(nid)

    # Count shared tags per pair
    pair_counts: Counter = Counter()
    for tag, node_ids in tag_index.items():
        if len(node_ids) > req.max_tag_frequency:
            continue
        for i, a in enumerate(node_ids):
            for b in node_ids[i + 1:]:
                pair = (min(a, b), max(a, b))
                pair_counts[pair] += 1

    # Filter pairs meeting threshold
    pairs_to_connect = [
        {"source": a, "target": b, "count": count}
        for (a, b), count in pair_counts.items()
        if count >= req.connection_threshold
    ]

    # Batch-create all connections in one Cypher call
    connections_created = 0
    if pairs_to_connect:
        connect_query = """
        UNWIND $pairs AS pair
        MATCH (a {id: pair.source}), (b {id: pair.target})
        CREATE (a)-[:RELATES_TO {shared_tags: pair.count, source: 'auto-connect'}]->(b)
        RETURN count(*) AS created
        """
        async with driver.session() as session:
            result = await session.run(connect_query, pairs=pairs_to_connect)
            record = await result.single()
            connections_created = record["created"] if record else 0

    return ConnectResponse(connections_created=connections_created)
