"""OCR handling: Tesseract (default) + Nanonets via Ollama (optional).

Tesseract is the reliable default requiring no GPU.
Nanonets-OCR-s is a vision-language GGUF model accessed through Ollama's
/api/chat endpoint with base64-encoded images.
"""

import base64
import io
import logging

import httpx
from PIL import Image

from config import OLLAMA_BASE_URL, NANONETS_MODEL_NAME, TESSERACT_LANG

logger = logging.getLogger(__name__)


def ocr_tesseract(image: Image.Image, lang: str = TESSERACT_LANG) -> str:
    """Run Tesseract OCR on a PIL Image."""
    import pytesseract

    text = pytesseract.image_to_string(image, lang=lang)
    return text.strip()


def ocr_nanonets(
    image: Image.Image,
    ollama_url: str = OLLAMA_BASE_URL,
    model_name: str = NANONETS_MODEL_NAME,
) -> str:
    """Run Nanonets-OCR via Ollama vision API.

    Converts image to base64 PNG and sends to Ollama /api/chat.
    """
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    b64_image = base64.b64encode(buf.getvalue()).decode("utf-8")

    try:
        response = httpx.post(
            f"{ollama_url}/api/chat",
            json={
                "model": model_name,
                "messages": [
                    {
                        "role": "user",
                        "content": (
                            "Extract all text from this image exactly as written. "
                            "Preserve formatting and layout. Return only the extracted text."
                        ),
                        "images": [b64_image],
                    }
                ],
                "stream": False,
            },
            timeout=120.0,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("message", {}).get("content", "").strip()
    except Exception as e:
        logger.error("Nanonets OCR failed: %s", e)
        raise


def ocr_page(
    image: Image.Image,
    engine: str = "tesseract",
    ollama_url: str = OLLAMA_BASE_URL,
    model_name: str = NANONETS_MODEL_NAME,
) -> str:
    """Dispatch to the appropriate OCR engine."""
    if engine == "nanonets":
        return ocr_nanonets(image, ollama_url, model_name)
    return ocr_tesseract(image)


def is_nanonets_available(
    ollama_url: str = OLLAMA_BASE_URL,
    model_name: str = NANONETS_MODEL_NAME,
) -> bool:
    """Check if the Nanonets model is loaded in Ollama."""
    try:
        response = httpx.get(f"{ollama_url}/api/tags", timeout=5.0)
        response.raise_for_status()
        models = response.json().get("models", [])
        return any(m.get("name", "").startswith(model_name.split(":")[0]) for m in models)
    except Exception:
        return False


def setup_nanonets_model(
    ollama_url: str = OLLAMA_BASE_URL,
    model_name: str = NANONETS_MODEL_NAME,
    gguf_path: str = "",
) -> bool:
    """Create the Nanonets model in Ollama from the GGUF file.

    Uses Ollama's /api/create endpoint with a modelfile string.
    """
    if not gguf_path:
        from config import GGUF_OCR_FILE
        gguf_path = str(GGUF_OCR_FILE)

    modelfile_content = f"FROM {gguf_path}\n"

    try:
        response = httpx.post(
            f"{ollama_url}/api/create",
            json={"name": model_name, "modelfile": modelfile_content},
            timeout=300.0,
        )
        response.raise_for_status()
        logger.info("Nanonets model created successfully: %s", model_name)
        return True
    except Exception as e:
        logger.error("Failed to create Nanonets model: %s", e)
        return False
