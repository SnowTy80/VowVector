#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
ENV_FILE="$REPO_ROOT/.env"
ENV_EXAMPLE="$REPO_ROOT/.env.example"

docker_cmd() {
  if docker info &>/dev/null 2>&1; then
    "$@"
  else
    sg docker -c "$(printf '%q ' "$@")"
  fi
}

if [ ! -f "$ENV_FILE" ] && [ -f "$ENV_EXAMPLE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Created .env from .env.example (edit if needed)."
fi

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a
  . "$ENV_FILE"
  set +a
fi

NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-vowvector_dev}"
QDRANT_HOST="${QDRANT_HOST:-localhost}"
QDRANT_PORT="${QDRANT_PORT:-6333}"
QDRANT_BASE="http://${QDRANT_HOST}:${QDRANT_PORT}"

usage() {
  cat << 'USAGE'
Usage: clean-reset.sh [--full]

--full  Stop containers and remove volumes (DESTROYS ALL DATA)

Default: wipes Neo4j nodes/links + Qdrant collections, then restarts backend.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "${1:-}" == "--full" ]]; then
  docker_cmd docker compose -f "$COMPOSE_FILE" down -v
  echo "Full reset complete (containers + volumes removed)."
  exit 0
fi

# Neo4j: delete all nodes + relationships
docker_cmd docker exec -i vv-neo4j cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
  'MATCH (n) DETACH DELETE n'

# Qdrant: delete collections
curl -s -X DELETE "${QDRANT_BASE}/collections/notes" > /dev/null || true
curl -s -X DELETE "${QDRANT_BASE}/collections/code" > /dev/null || true
curl -s -X DELETE "${QDRANT_BASE}/collections/research" > /dev/null || true
curl -s -X DELETE "${QDRANT_BASE}/collections/ai_interactions" > /dev/null || true

# Restart backend so collections re-init
docker_cmd docker compose -f "$COMPOSE_FILE" restart backend

echo "Clean reset complete (graph + vectors cleared)."
