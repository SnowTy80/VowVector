from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.conversations import router as conversations_router
from app.api.nodes import graph_router, router as nodes_router
from app.api.upload import router as upload_router
from app.core.connections import close_neo4j_driver, init_qdrant_collections


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize Qdrant collections
    init_qdrant_collections()
    yield
    # Shutdown: close Neo4j driver
    await close_neo4j_driver()


app = FastAPI(
    title="VowVector API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(nodes_router)
app.include_router(graph_router)
app.include_router(upload_router)
app.include_router(conversations_router)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "vowvector-api"}


@app.get("/")
async def root():
    return {"message": "VowVector API", "docs": "/docs"}
