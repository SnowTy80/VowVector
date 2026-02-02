from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional

from app.models.node import NodeResponse
from app.services.ingestion_service import ingest_file
from app.utils.text_processor import SUPPORTED_EXTENSIONS

router = APIRouter(prefix="/upload", tags=["upload"])


@router.post("", response_model=NodeResponse, status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
):
    """Upload a file to create a knowledge node.

    Supports: .txt, .md, .py, .js, .ts, .rs, .go, .java, .c, .cpp,
              .h, .sh, .yaml, .yml, .toml, .json, .html, .css
    """
    content = await file.read()

    extra_tags = [t.strip() for t in tags.split(",") if t.strip()] if tags else None

    try:
        node = await ingest_file(
            filename=file.filename,
            content=content,
            title_override=title or None,
            extra_tags=extra_tags,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return node


@router.get("/supported-types")
async def supported_types():
    """Return list of supported file extensions."""
    return {"extensions": sorted(SUPPORTED_EXTENSIONS)}
