import httpx

from app.core.config import settings


async def generate_embedding(text: str) -> list[float]:
    """Generate an embedding vector from text using Ollama."""
    async with httpx.AsyncClient(
        base_url=settings.ollama_base_url, timeout=60.0
    ) as client:
        # Newer Ollama builds use /api/embed, older use /api/embeddings
        response = await client.post(
            "/api/embed",
            json={
                "model": settings.embedding_model,
                "input": text,
            },
        )
        if response.status_code == 404:
            response = await client.post(
                "/api/embeddings",
                json={
                    "model": settings.embedding_model,
                    "prompt": text,
                },
            )
            response.raise_for_status()
            data = response.json()
            # /api/embeddings returns {"embedding": [...]} (singular, flat)
            return data["embedding"]

        response.raise_for_status()
        data = response.json()
        # /api/embed returns {"embeddings": [[...]]} (nested)
        return data["embeddings"][0]
