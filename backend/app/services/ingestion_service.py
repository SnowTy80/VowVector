"""File ingestion pipeline: extract text -> create node -> embed -> store vector."""

from app.models.node import NodeCreate, NodeResponse, NodeType
from app.services import embedding_service, graph_service, vector_service
from app.utils.text_processor import (
    derive_title,
    detect_node_type,
    extract_tags,
    extract_text,
    is_supported,
    chunk_text,
)


async def ingest_file(
    filename: str,
    content: bytes,
    title_override: str | None = None,
    extra_tags: list[str] | None = None,
) -> NodeResponse:
    """Process an uploaded file through the full ingestion pipeline.

    1. Validate and extract text
    2. Detect node type from extension
    3. Create node in Neo4j
    4. Generate embedding via Ollama
    5. Store vector in Qdrant

    Returns the created NodeResponse.
    Raises ValueError for unsupported or undecodable files.
    """
    if not is_supported(filename):
        raise ValueError(f"Unsupported file type: {filename}")

    text = extract_text(content, filename)
    node_type_str = detect_node_type(filename)
    title = title_override or derive_title(filename)
    tags = extract_tags(filename, text)
    if extra_tags:
        tags.extend(extra_tags)

    # Create node in Neo4j
    ctx_size = len(text)
    embed_text = f"{title}\n\n{text}"
    chunks = chunk_text(embed_text)
    if not chunks:
        chunks = [embed_text]
    chunk_count = len(chunks)
    ctx_bucket = "small" if ctx_size <= 3000 else "medium" if ctx_size <= 9000 else "large"

    node_data = NodeCreate(
        title=title,
        content=text,
        node_type=NodeType(node_type_str),
        tags=tags,
        metadata={
            "source_file": filename,
            "file_size": len(content),
            "ctx_size": ctx_size,
            "ctx_bucket": ctx_bucket,
            "chunk_count": chunk_count,
            "chunked": chunk_count > 1,
        },
    )
    created = await graph_service.create_node(node_data)

    # Generate embedding and store in Qdrant
    try:
        for idx, chunk in enumerate(chunks):
            embedding = await embedding_service.generate_embedding(chunk)
            vector_service.upsert_vector(
                node_id=created.id,
                node_type=node_data.node_type,
                embedding=embedding,
                title=title,
                tags=tags,
                created_at=created.created_at,
                chunk_index=idx,
                chunk_count=len(chunks),
            )
    except Exception as e:
        print(f"WARNING: Embedding failed for uploaded file {filename}: {e}")

    return created
