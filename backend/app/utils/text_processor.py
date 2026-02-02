"""Extract text content from uploaded files."""

from pathlib import Path

# Supported extensions and their node type mapping
EXT_TO_NODE_TYPE = {
    ".txt": "Note",
    ".md": "Note",
    ".py": "Code",
    ".js": "Code",
    ".ts": "Code",
    ".jsx": "Code",
    ".tsx": "Code",
    ".rs": "Code",
    ".go": "Code",
    ".java": "Code",
    ".c": "Code",
    ".cpp": "Code",
    ".h": "Code",
    ".sh": "Code",
    ".yaml": "Code",
    ".yml": "Code",
    ".toml": "Code",
    ".json": "Code",
    ".html": "Code",
    ".css": "Code",
}

SUPPORTED_EXTENSIONS = set(EXT_TO_NODE_TYPE.keys())

# Chunking defaults for embedding
CHUNK_SIZE = 3000
CHUNK_OVERLAP = 200


def is_supported(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_EXTENSIONS


def detect_node_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return EXT_TO_NODE_TYPE.get(ext, "Note")


def extract_text(content: bytes, filename: str) -> str:
    """Decode file bytes to text. Raises ValueError on binary/undecodable files."""
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return content.decode("latin-1")
        except UnicodeDecodeError:
            raise ValueError(f"Cannot decode {filename} as text")


def derive_title(filename: str) -> str:
    """Create a node title from the filename."""
    stem = Path(filename).stem
    # Convert snake_case / kebab-case to readable title
    return stem.replace("_", " ").replace("-", " ").title()


def extract_tags(filename: str, content: str) -> list[str]:
    """Auto-generate tags from file metadata."""
    tags = []
    ext = Path(filename).suffix.lower()
    if ext:
        tags.append(ext.lstrip("."))
    tags.append("uploaded")
    return tags


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks for embedding."""
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
