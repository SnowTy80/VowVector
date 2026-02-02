"""Text chunking — exact replica of VowVector backend text_processor.py logic.

Ensures pipeline compatibility: same chunk_size=3000, overlap=200.
"""

from config import CHUNK_SIZE, CHUNK_OVERLAP


def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[str]:
    """Split text into overlapping chunks for embedding.

    This is a direct port of backend/app/utils/text_processor.py::chunk_text
    to ensure identical chunking behavior with the main pipeline.
    """
    if not text:
        return []
    if chunk_size <= 0:
        return [text]
    if overlap >= chunk_size:
        overlap = max(0, chunk_size // 4)

    chunks = []
    start = 0
    length = len(text)
    while start < length:
        end = min(start + chunk_size, length)
        chunks.append(text[start:end])
        if end == length:
            break
        start = end - overlap
    return chunks


def compute_ctx_metadata(text: str, chunks: list[str]) -> dict:
    """Compute metadata fields matching backend ingestion_service.py.

    Returns dict with: ctx_size, ctx_bucket, chunk_count, chunked.
    """
    ctx_size = len(text)
    chunk_count = len(chunks)
    ctx_bucket = (
        "small" if ctx_size <= 3000
        else "medium" if ctx_size <= 9000
        else "large"
    )
    return {
        "ctx_size": ctx_size,
        "ctx_bucket": ctx_bucket,
        "chunk_count": chunk_count,
        "chunked": chunk_count > 1,
    }
