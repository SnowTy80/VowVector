# VowVector

[![Stars](https://img.shields.io/github/stars/SnowTy80/VowVector?style=social)](https://github.com/SnowTy80/VowVector/stargazers)
[![Forks](https://img.shields.io/github/forks/SnowTy80/VowVector?style=social)](https://github.com/SnowTy80/VowVector/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://www.docker.com/)

A local, GPU-accelerated knowledge graph system with 3D visualization. Ingest files and text into a Neo4j graph database and Qdrant vector store, then explore connections in an immersive cyberpunk-styled WebGL interface.

Everything runs on your machine via Docker. No cloud dependencies.

Support for this tool will continue but spotty, as this is being developed for personal-use. The 3D visualizer for QDrant Vector storage containers is the first tool in a series of an agenic-focused aresenal, aimed for seemless orchestration for the proper handling, foarmatting, and indexing of complex data-sets. 


Watch me upload 4 years of conversations with ChatGPT/Grok into this tool and watch it grow progressively:
https://www.youtube.com/watch?v=3ltH7R0NfKA



---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Screenshots / GIFs](#screenshots--gifs)
- [CLI Reference](#cli-reference)
- [Services & Ports](#services--ports)
- [Resource Budget](#resource-budget)
- [Ingestion Pipeline](#ingestion-pipeline)
- [Data Formatter (formatter)](#data-formatter-formatter)
- [Data Model](#data-model)
- [API Reference](#api-reference)
- [3D Visualization](#3d-visualization)
- [Configuration](#configuration)
- [Maintenance](#maintenance)
- [Project Structure](#project-structure)
- [Supported File Types](#supported-file-types)

---

## Architecture

```
                  ┌─────────────────────────────────────────────────┐
                  │                  Docker Network                 │
                  │                  (vv-network)                   │
                  │                                                 │
  Browser ──────▶ │  ┌───────────┐      ┌───────────┐              │
  :5173           │  │ Frontend  │─────▶│  Backend  │              │
                  │  │ Vite+3.js │ /api │  FastAPI  │              │
                  │  └───────────┘      └─────┬─────┘              │
                  │                       │   │   │                │
                  │              ┌────────┘   │   └────────┐       │
                  │              ▼            ▼            ▼       │
                  │        ┌──────────┐ ┌──────────┐ ┌──────────┐ │
                  │        │  Neo4j   │ │  Qdrant  │ │  Ollama  │ │
                  │        │  Graph   │ │  Vectors │ │  Embed   │ │
                  │        │  :7687   │ │  :6333   │ │  :11434  │ │
                  │        └──────────┘ └──────────┘ └────┬─────┘ │
                  │                                       │ GPU   │
                  └───────────────────────────────────────┼───────┘
                                                          ▼
                                                   NVIDIA GPU #1

  ┌──────────────────────────────────────┐
  │       Data Formatter (formatter)    │    Standalone preprocessing tool
  │         Streamlit :8501              │    Feeds formatted JSON into
  │   PDF / DOCX / XLSX / CSV / Images  │──▶ the VowVector upload pipeline
  │   OCR + Sanitization + Auto-tagging │
  └──────────────────────────────────────┘
```

**Tech Stack:**

| Layer            | Technology                                         |
|------------------|----------------------------------------------------|
| Frontend         | Vite 6 + Vanilla JS + Three.js + 3d-force-graph    |
| Backend          | FastAPI (Python 3.12, async)                        |
| Graph DB         | Neo4j 5 Community + APOC                            |
| Vector DB        | Qdrant (cosine similarity)                          |
| Embeddings       | Ollama + nomic-embed-text v1.5 (768-dim, Q4_K_M)   |
| Data Formatter   | Streamlit + PyMuPDF + Tesseract OCR + Presidio NER  |
| Runtime          | Docker Compose + NVIDIA Container Toolkit           |

---

## Prerequisites

- **Linux** (tested on Ubuntu/Pop!_OS)
- **Docker Engine** with Compose v2
- **NVIDIA GPU** with drivers installed
- **NVIDIA Container Toolkit** (`nvidia-ctk`)
- **Python 3.12+** (for Data Formatter only; stack services run in Docker)

An install script is provided for first-time setup:

```bash
sudo bash scripts/install-prereqs.sh
```

This installs Docker Engine, NVIDIA Container Toolkit, and Node.js 22 LTS.

---

## Quick Start

```bash
git clone https://github.com/MrNoSkillz/VowVector.git
cd VowVector
cp .env.example .env
sudo bash scripts/install-prereqs.sh
vv start
```

Open the UI: http://localhost:5173

If no local GGUF is found in `models/embed/`, `vv start` will pull `nomic-embed-text:v1.5` via Ollama.

### Using the `vv` CLI (recommended)

```bash
# First time: add ~/.local/bin to your PATH (already done if you ran the setup)
source ~/.bashrc

# Create your local env file (vv will auto-create if missing)
cp .env.example .env

# Start the 3D visualizer stack
vv start

# Check status
vv status

# Set up the Data Formatter (one-time)
vv format setup

# Launch the Data Formatter GUI
vv format start
```

### Manual start

```bash
cd VowVector
cp .env.example .env
sg docker -c "docker compose up --build -d"

# Load the embedding model (first time only)
bash scripts/init-ollama.sh

# Verify all services
bash scripts/verify-stack.sh
```

### Access Points

| Service            | URL                              | Purpose                                  |
|--------------------|----------------------------------|------------------------------------------|
| **Frontend**       | http://localhost:5173            | 3D graph UI                              |
| **API Docs**       | http://localhost:8000/docs       | Swagger/OpenAPI                          |
| **Neo4j**          | http://localhost:7474            | Graph browser (neo4j/vowvector_dev)      |
| **Qdrant**         | http://localhost:6333/dashboard  | Vector DB dashboard                      |
| **Data Formatter** | http://localhost:8501            | Document preprocessing GUI               |

---

## Screenshots / GIFs

- 3D graph with glowing nodes
- Data Formatter GUI uploading a PDF
- Node details panel
- Neo4j browser view
- (Optional) camera orbit + node click GIF

---

## CLI Reference

The `vv` command is a wrapper around Docker Compose that manages the full stack. Run it as `./vv` or install the symlink to `~/.local/bin/vv` via `scripts/install-prereqs.sh`.

### Stack Management

| Command           | Description                                              |
|-------------------|----------------------------------------------------------|
| `vv start`        | Build images, start all 5 services, load embedding model |
| `vv stop`         | Stop and remove all containers                           |
| `vv restart`      | Stop then start                                          |
| `vv status`       | Show container status and health                         |
| `vv logs`         | Tail logs from all services                              |
| `vv logs backend` | Tail logs from a single service                          |
| `vv verify`       | Health-check all 5 endpoints + GPU status                |
| `vv reset`        | Soft reset: wipe graph + vectors, keep containers        |
| `vv reset --full` | Full reset: destroy containers + volumes                 |

### Data Formatter

| Command             | Description                                            |
|---------------------|--------------------------------------------------------|
| `vv format setup`   | Install venv, Python deps, spaCy model, Tesseract, copy OCR model |
| `vv format start`   | Launch Data Formatter GUI (http://localhost:8501)       |
| `vv format stop`    | Stop the Data Formatter                                |
| `vv format status`  | Check if Data Formatter is running                     |

### General

| Command    | Description       |
|------------|-------------------|
| `vv help`  | Show help message |

---

## Services & Ports

| Service        | Container     | Ports        | Image                    | Health Check             |
|----------------|---------------|--------------|--------------------------|--------------------------|
| Neo4j          | `vv-neo4j`    | 7474, 7687   | `neo4j:5-community`      | HTTP GET :7474           |
| Qdrant         | `vv-qdrant`   | 6333, 6334   | `qdrant/qdrant:latest`   | HTTP GET :6333/healthz   |
| Ollama         | `vv-ollama`   | 11434        | `ollama/ollama:latest`   | HTTP GET :11434/api/tags |
| Backend        | `vv-backend`  | 8000         | python:3.12-slim (built) | HTTP GET :8000/health    |
| Frontend       | `vv-frontend` | 5173         | node:22-alpine (built)   | Depends on backend       |
| Data Formatter | (host process)| 8501         | Streamlit (Python venv)  | `vv format status`       |

**Startup order** (enforced by `depends_on` + health conditions):

```
Neo4j ──┐
Qdrant ─┤──▶ Backend (waits for all 3 healthy) ──▶ Frontend (waits for backend healthy)
Ollama ─┘

Data Formatter runs independently on the host (not in Docker).
```

---

## Resource Budget

| Service        | Memory                                           | CPU             | GPU                        |
|----------------|--------------------------------------------------|-----------------|----------------------------|
| Neo4j          | 512MB heap init, 1GB heap max, 512MB page cache  | default         | —                          |
| Qdrant         | default                                          | default         | —                          |
| Ollama         | default                                          | default         | NVIDIA device #1 (reserved)|
| Backend        | 512MB limit                                      | 1.0 CPU limit   | —                          |
| Frontend       | 256MB limit                                      | 0.5 CPU limit   | —                          |
| Data Formatter | ~1GB (spaCy model + Presidio)                    | default         | —                          |

**Embedding model:** nomic-embed-text v1.5 Q4_K_M (~84MB on disk, ~136M parameters)

**OCR model (optional):** Nanonets-OCR-s Q8_0 (~3.06GB, loaded via Ollama for high-quality OCR)

**Persistent Docker volumes:** `neo4j_data`, `neo4j_logs`, `qdrant_data`, `ollama_data`

---

## Ingestion Pipeline

When a file is uploaded or a raw entry is created, it flows through this pipeline:

```
Input (file bytes or raw text)
  │
  ├──▶ Text extraction (UTF-8, Latin-1 fallback)
  ├──▶ Node type detection (extension → Note / Code / Research / etc.)
  ├──▶ Title derivation (filename → readable title, or user override)
  ├──▶ Auto-tag generation (extension, "uploaded", context size)
  │
  ├──▶ Create node in Neo4j (graph entry with full metadata)
  │
  ├──▶ Chunk text (3000 chars, 200 char overlap)
  │     └──▶ For each chunk:
  │           ├──▶ Generate 768-dim embedding via Ollama
  │           └──▶ Upsert vector to Qdrant (UUID5 deterministic ID)
  │
  └──▶ Return NodeResponse
```

**Chunking parameters:**

| Parameter       | Value            |
|-----------------|------------------|
| Chunk size      | 3,000 characters |
| Chunk overlap   | 200 characters   |
| Vector dim      | 768              |
| Distance metric | Cosine           |

**Context bucketing** (stored in node metadata):

| Bucket   | Content length      |
|----------|---------------------|
| `small`  | <= 3,000 chars      |
| `medium` | 3,001 - 9,000 chars |
| `large`  | > 9,000 chars       |

Embedding failures are non-fatal: the node is always created in Neo4j, and a warning is logged if embedding/vector storage fails.

---

## Data Formatter (formatter)

A standalone Streamlit tool that preprocesses raw documents into structured JSON files ready for the VowVector ingestion pipeline. It sits **upstream** of the main stack — it does not embed or insert into Qdrant directly.

### What It Does

```
Raw Documents (PDF, DOCX, XLSX, CSV, TXT, Images)
  │
  ├──▶ Text extraction (PyMuPDF for PDF, python-docx, openpyxl, etc.)
  ├──▶ OCR for scanned/graphical PDFs (Tesseract default, Nanonets optional)
  ├──▶ PII sanitization (Presidio NER + regex: names, orgs, dollars, addresses, phones)
  ├──▶ Auto-tagging (document type, topic keywords, domain labels, section headings)
  ├──▶ Text chunking (3000/200 — matching the main pipeline exactly)
  │
  └──▶ Structured JSON output (compatible with NodeCreate schema)
```

### Setup & Usage

```bash
# One-time setup (creates venv, installs deps, downloads spaCy model)
vv format setup

# Launch the GUI
vv format start

# Open in browser
# http://localhost:8501

# Stop when done
vv format stop
```

Optional: to enable Nanonets OCR, place `Nanonets-OCR-s-Q8_0.gguf` at
`models/ocr/Nanonets-OCR-s-Q8_0/Nanonets-OCR-s-Q8_0.gguf` or set
`NANONETS_GGUF_SOURCE=/path/to/Nanonets-OCR-s-Q8_0.gguf` before running setup.

### GUI Controls

| Control                | Description                                                  |
|------------------------|--------------------------------------------------------------|
| File upload            | Drag-and-drop multiple files                                 |
| Folder path            | Text input for batch processing an entire directory          |
| Node type dropdown     | Select node type for the batch (Note, Code, Research, etc.)  |
| Enable OCR             | Toggle OCR for scanned documents                             |
| Graphical PDF          | Force OCR on all pages (for scans, diagrams, or slides)      |
| OCR engine             | Tesseract (default, no GPU) or Nanonets (via Ollama)         |
| PII redaction toggles  | Person names, organizations, dollar amounts, addresses, phones|
| Output directory       | Where to save formatted JSON files                           |

### JSON Output Schema

Each processed document produces a JSON file compatible with the VowVector backend `NodeCreate` model:

```json
{
  "title": "System Design Notes - Authentication Flow",
  "content": "Full extracted and sanitized text...",
  "node_type": "Research",
  "tags": ["pdf", "design-notes", "auth", "security", "formatted"],
  "metadata": {
    "source_file": "auth_design_notes.pdf",
    "file_size": 245760,
    "ctx_size": 15234,
    "ctx_bucket": "large",
    "chunk_count": 6,
    "chunked": true,
    "doc_type": "design",
    "extraction_method": "native_text",
    "page_count": 12,
    "sanitized": true,
    "redaction_count": 7,
    "topics": ["authentication", "security", "user-flows"],
    "keywords": ["token", "session", "oauth"],
    "sections": ["Auth Overview", "Token Lifecycle"],
    "formatter_version": "1.0.0",
    "processed_at": "2026-02-02T15:30:00Z"
  },
  "chunks": ["chunk1...", "chunk2...", "..."]
}
```

### Auto-Tagging for Neo4j

The tagger automatically detects and labels:

| Tag Category   | Examples                                            | Purpose                        |
|----------------|-----------------------------------------------------|--------------------------------|
| Document type  | `report`, `design`, `proposal`, `paper`, `notes`    | Classify the document          |
| Domain labels  | `security`, `ml`, `frontend`, `backend`             | Link to topic-specific nodes   |
| Keywords       | `oauth`, `vector-db`, `webgl`, `prompt`             | Surface searchable concepts    |
| Section titles | `Overview`, `Methods`, `Results`, `Appendix`        | High-level outline references  |

These tags enable future auto-connection of nodes in Neo4j based on shared topics, keywords, or document sections.

### OCR Modes

| Mode                    | When to Use                                         | Engine    |
|-------------------------|-----------------------------------------------------|-----------|
| Auto OCR (default)      | Scanned PDFs with <50 chars/page average            | Tesseract |
| Graphical PDF (toggle)  | Slide decks, diagrams, or image-heavy PDFs          | Tesseract |
| Nanonets (optional)     | Complex layouts needing higher accuracy (requires Ollama) | Nanonets-OCR-s |

### Sanitization

PII redaction replaces sensitive data with typed markers:

| Data Type      | Example Before                  | Example After                |
|----------------|---------------------------------|------------------------------|
| Person name    | `John Smith`                    | `[REDACTED_PERSON]`          |
| Organization   | `Acme Analytics`                | `[REDACTED_ORGANIZATION]`    |
| Dollar amount  | `$45,000.00`                    | `[REDACTED_DOLLAR_AMOUNT]`   |
| Phone number   | `(520) 555-1234`                | `[REDACTED_PHONE_NUMBER]`    |
| Location       | `Tucson, Arizona`               | `[REDACTED_LOCATION]`        |

---

## Data Model

### Node Types

| Type            | Has Embeddings | Qdrant Collection  |
|-----------------|----------------|--------------------|
| Note            | Yes            | `notes`            |
| Code            | Yes            | `code`             |
| AIInteraction   | Yes            | `ai_interactions`  |
| Research        | Yes            | `research`         |
| Concept         | Yes            | `notes`            |
| Project         | No             | —                  |
| Tag             | No             | —                  |
| Topic           | No             | —                  |

### Relationship Types

| Relationship  | Intended Use                              |
|---------------|-------------------------------------------|
| RELATES_TO    | General semantic connection               |
| IMPLEMENTS    | Code implements a concept                 |
| GENERATED     | AI output from a prompt                   |
| SUPPORTS      | Evidence or supporting material           |
| BELONGS_TO    | Member of a project or group              |
| HAS_TAG       | Node tagged with a topic                  |
| INSPIRED_BY   | Creative/intellectual lineage             |
| REVISION_OF   | Updated version of existing content       |

### Node Properties

| Property     | Type     | Description                              |
|-------------|----------|------------------------------------------|
| `id`        | string   | Timestamp-based: `{type}_{iso_timestamp}` |
| `title`     | string   | 1-500 characters                         |
| `content`   | string   | Full text or code                        |
| `node_type` | enum     | One of the node types above              |
| `tags`      | string[] | Auto-generated + user-defined            |
| `metadata`  | object   | `ctx_size`, `ctx_bucket`, `chunk_count`, `chunked`, `source_file`, `file_size` |
| `created_at`| string   | ISO 8601 timestamp                       |
| `updated_at`| string   | ISO 8601 timestamp                       |

---

## API Reference

**Base URL:** `http://localhost:8000`

Full interactive documentation is available at `http://localhost:8000/docs` (Swagger UI).

### Nodes

| Method | Endpoint              | Description                      |
|--------|-----------------------|----------------------------------|
| POST   | `/nodes`              | Create a node (with auto-embed)  |
| GET    | `/nodes`              | List nodes (paginated, filterable) |
| GET    | `/nodes/{id}`         | Get a single node                |
| PUT    | `/nodes/{id}`         | Update node (re-embeds if content changes) |
| DELETE | `/nodes/{id}`         | Delete node from Neo4j + Qdrant  |

**Query parameters for `GET /nodes`:**

| Param     | Type   | Default | Range        |
|-----------|--------|---------|--------------|
| node_type | string | (all)   | NodeType enum value |
| skip      | int    | 0       | >= 0         |
| limit     | int    | 50      | 1 - 200      |

### Relationships

| Method | Endpoint                                          | Description          |
|--------|---------------------------------------------------|----------------------|
| POST   | `/nodes/{id}/link`                                | Create a relationship|
| DELETE | `/nodes/{id}/link?target_id=...&relationship=...` | Delete a relationship|

**POST body:**
```json
{
  "target_id": "note_2026-01-15T...",
  "relationship": "RELATES_TO",
  "properties": {}
}
```

### File Upload

| Method | Endpoint                 | Description                     |
|--------|--------------------------|---------------------------------|
| POST   | `/upload`                | Upload file -> node + embedding |
| GET    | `/upload/supported-types`| List supported file extensions  |

Upload accepts `multipart/form-data`:
- `file` (required): The file to ingest
- `title` (optional): Override the auto-derived title
- `tags` (optional): Comma-separated extra tags

### Graph & Health

| Method | Endpoint   | Description                        |
|--------|------------|------------------------------------|
| GET    | `/graph`   | All nodes + links for 3D visualization |
| GET    | `/health`  | Service health check               |
| GET    | `/`        | API info                           |

---

## 3D Visualization

The frontend renders a force-directed 3D graph using [3d-force-graph](https://github.com/vasturiano/3d-force-graph) and Three.js.

### Node Colors by Type

| Type            | Color              |
|-----------------|--------------------|
| Note            | Cyan (`#00ffff`)   |
| Code            | Purple (`#ff00ff`) |
| AIInteraction   | Green (`#00ff00`)  |
| Research        | Yellow (`#ffff00`) |
| Project         | Pink / Magenta     |
| Concept         | Orange             |
| Tag             | White              |
| Topic           | Light Blue         |

### Motion Controls

| Control        | Range     | Default | Effect                          |
|----------------|-----------|---------|---------------------------------|
| Spread         | 20 - 300  | 80      | Link distance (graph spacing)   |
| Breathing      | on/off    | off     | Oscillating camera distance     |
| Orbit          | on/off    | off     | Auto-rotate camera around center|
| Node Size      | slider    | 1.0     | Visual scale factor             |
| Glow Intensity | 0.0 - 2.0| —       | Emission / halo strength        |
| Glow Color     | picker    | —       | Tint color for glow effect      |
| Static Mode    | toggle    | off     | Pauses orbit + breathing        |

### Node Rendering

Each node is rendered with three visual layers:
1. **Phong sphere** with emissive glow (colored by type)
2. **Fresnel rim shader** for neon silhouette outline
3. **Sprite halo** with additive blending for ambient glow

Node size scales logarithmically based on `ctx_size` metadata, clamped between 0.8x and 2.0x. Project nodes receive a 1.5x multiplier.

### Interactions

- **Click node**: Open details panel (identity, content, tags, connections)
- **Click connection name**: Navigate camera to linked node
- **Edit**: Modify title, content, tags inline
- **Delete**: Remove node with confirmation dialog
- **Manual connect**: Create or remove relationships via modal
- **Auto-refresh**: Graph data polls every 10 seconds with change detection (camera position is preserved)

---

## Configuration

### Environment Variables

Set in `.env` (copy `.env.example` and edit as needed):

| Variable        | Default                    | Description                  |
|-----------------|----------------------------|------------------------------|
| NEO4J_URI       | `bolt://neo4j:7687`        | Neo4j Bolt connection URI    |
| NEO4J_USER      | `neo4j`                    | Neo4j username               |
| NEO4J_PASSWORD  | `vowvector_dev`            | Neo4j password               |
| QDRANT_HOST     | `qdrant`                   | Qdrant hostname              |
| QDRANT_PORT     | `6333`                     | Qdrant REST API port         |
| OLLAMA_BASE_URL | `http://ollama:11434`      | Ollama API base URL          |
| EMBEDDING_MODEL | `nomic-embed-text:v1.5`    | Ollama embedding model name  |
| EMBEDDING_DIM   | `768`                      | Vector dimensionality        |
| OLLAMA_GPU_DEVICE | `1`                      | GPU device index for Ollama  |

### GPU Configuration

Ollama is configured to use NVIDIA GPU device `1` (0-indexed). To change this, edit `.env`:

```bash
OLLAMA_GPU_DEVICE=0
```

List available GPUs with: `nvidia-smi -L`

### Neo4j Memory Tuning

Current settings in `docker-compose.yml`:

| Setting                   | Value  | Purpose                |
|---------------------------|--------|------------------------|
| `heap_initial__size`      | 512m   | JVM heap at startup    |
| `heap_max__size`          | 1G     | JVM heap cap           |
| `pagecache_size`          | 512m   | Disk read cache        |

---

## Maintenance

### Soft Reset (keep containers, wipe data)

```bash
vv reset
```

Clears all Neo4j nodes/relationships and deletes Qdrant collections, then restarts the backend to recreate empty collections.

### Full Reset (destroy everything)

```bash
vv reset --full
```

Removes all containers and Docker volumes. Run `vv start` afterward to rebuild from scratch.

### Seed Test Data

```bash
python3 scripts/seed-data.py                   # 1000+ nodes with relationships
python3 scripts/seed-data.py --skip-embedding   # Skip Ollama calls (faster)
```

### View Logs

```bash
vv logs              # All services
vv logs backend      # Single service
vv logs ollama       # Check GPU / model status
```

### Verify Stack Health

```bash
vv verify
```

Checks all 5 service endpoints, shows container status, and reports GPU memory usage.

---

## Project Structure

```
VowVector/
├── README.md                          # Project overview and docs
├── LICENSE                            # MIT
├── .gitignore                         # Ignore secrets, models, outputs
├── .env.example                       # Safe defaults (copy to .env)
├── docker-compose.yml                 # 5-service Docker Compose definition
├── vv                                 # CLI launcher (make executable)
├── scripts/
│   ├── install-prereqs.sh             # Install Docker + NVIDIA Toolkit + Node.js
│   ├── init-ollama.sh                 # Load embedding model (local GGUF or pull)
│   ├── verify-stack.sh                # Health-check all 5 services
│   ├── seed-data.py                   # Generate 1000+ test nodes + relationships
│   └── clean-reset.sh                 # Wipe graph + vector data
├── backend/
│   ├── Dockerfile                     # Python 3.12-slim image
│   ├── requirements.txt               # Python dependencies
│   └── app/
│       ├── main.py                    # FastAPI app, lifespan hooks, CORS, routers
│       ├── core/
│       │   ├── config.py              # Pydantic settings (env-driven)
│       │   └── connections.py         # Neo4j + Qdrant singleton clients
│       ├── models/
│       │   └── node.py                # Enums, Pydantic schemas, collection mapping
│       ├── api/
│       │   ├── nodes.py               # CRUD, graph query, link endpoints
│       │   └── upload.py              # File upload endpoint
│       ├── services/
│       │   ├── graph_service.py       # Neo4j Cypher operations
│       │   ├── vector_service.py      # Qdrant upsert / search / delete
│       │   ├── embedding_service.py   # Ollama embedding generation
│       │   └── ingestion_service.py   # File -> node -> embed pipeline
│       └── utils/
│           └── text_processor.py      # Text chunking, extraction, type detection
├── frontend/
│   ├── Dockerfile                     # Node 22 Alpine image
│   ├── package.json                   # three.js, 3d-force-graph, vite
│   ├── vite.config.js                 # Dev server config + /api proxy to backend
│   ├── index.html                     # Entry HTML
│   └── src/
│       ├── main.js                    # App initialization, polling, motion controls
│       ├── api.js                     # Fetch wrapper for backend API
│       ├── components/
│       │   ├── CreateNodeModal.js     # Raw text/code entry form
│       │   ├── UploadModal.js         # File and folder upload UI
│       │   ├── NodePanel.js           # Node details, edit, delete panel
│       │   └── ManualConnectModal.js  # Relationship creation/deletion
│       ├── utils/
│       │   └── colorSchemes.js        # Node type -> color mapping
│       └── visualization/
│           ├── graph3d.js             # 3d-force-graph setup + camera controls
│           └── node-renderer.js       # Three.js Phong + Fresnel + halo rendering
├── formatter/
│   ├── app.py                         # Streamlit GUI
│   ├── config.py                      # Paths, constants, regex patterns, domain labels
│   ├── requirements.txt               # Python dependencies
│   ├── setup.sh                       # Automated setup (venv, deps, spaCy, OCR model)
│   ├── core/
│   │   ├── __init__.py
│   │   ├── chunker.py                 # Text chunking (3000/200, matches backend)
│   │   ├── extractor.py               # Text extraction: PDF, DOCX, XLSX, CSV, TXT, images
│   │   ├── ocr.py                     # Tesseract + Nanonets/Ollama OCR engines
│   │   ├── sanitizer.py               # PII redaction (Presidio NER + regex)
│   │   └── tagger.py                  # Auto-tagging: doc type, domains, keywords
│   └── output/                        # Default output directory for formatted JSON (ignored)
└── models/
    └── README.md                      # Where to place GGUF models
```

---

## Supported File Types

### VowVector (Direct Upload via API)

| Extensions                                          | Node Type |
|-----------------------------------------------------|-----------|
| `.txt`, `.md`                                       | Note      |
| `.py`, `.js`, `.ts`, `.jsx`, `.tsx`                 | Code      |
| `.rs`, `.go`, `.java`, `.c`, `.cpp`, `.h`, `.sh`    | Code      |
| `.yaml`, `.yml`, `.toml`, `.json`, `.html`, `.css`  | Code      |

### Formatter (Preprocessed to JSON)

| Extension             | Examples                           | Extraction Method               |
|-----------------------|------------------------------------|---------------------------------|
| `.pdf`                | Papers, reports, slide decks       | PyMuPDF native text + OCR fallback |
| `.docx`               | Specs, proposals, meeting notes    | python-docx (paragraphs + tables) |
| `.xlsx`               | Metrics, inventories, datasets     | openpyxl (all sheets)           |
| `.csv`                | Exports, logs, datasets            | csv stdlib                      |
| `.txt`, `.md`         | Notes, logs                        | UTF-8 / Latin-1 fallback       |
| `.png`, `.jpg`, `.jpeg`, `.tiff`, `.bmp`, `.webp` | Screenshots, scans, photos | Tesseract / Nanonets OCR |

---

## Typical Usage Flow

1. **Start the stack** with `vv start`
2. **Open the UI** at http://localhost:5173
3. **For text/code files**: Upload directly via the 3D visualizer upload modal
4. **For PDFs/Excel/Word/images**: Use the Data Formatter (`vv format start`)
   - Upload documents, configure OCR and sanitization settings
   - Review extracted text and auto-generated tags
   - Save formatted JSON to the output directory
   - Import the JSON files into VowVector via the API
5. **Explore the 3D graph** — nodes are colored by type and sized by content length
6. **Click nodes** to inspect details, edit content, or manage tags
7. **Create manual connections** between nodes to build meaningful knowledge structure

---

## Notes

- Conversation and Research uploads are reserved for future structured zip ingestion.
- Auto-connect is intentionally limited to folder groups to keep graph structure clean.
- Embedding model GGUF files are mounted read-only from `models/`.
- The Data Formatter runs on the host (not in Docker) and uses its own Python venv at `formatter/.venv`.
- The Nanonets OCR model is optional. Tesseract handles most documents well. Nanonets is better for complex layouts and stylized text.

---
## VowVector

-VowVector is a start-up between a friend & I, that focuses on the methods used for both, the transparency & privacy methods to consider with proper data handling.
-Developed primarily for H.I.L(Human in Loop) automation with systems like Linux/Windows. 


**AI-Assisted** Tools like Codex & Claude;IDE were used to assist in the development of this codespace. 
