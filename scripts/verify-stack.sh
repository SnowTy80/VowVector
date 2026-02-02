#!/bin/bash
# Verify all VowVector services are running and responsive
set -o pipefail

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

echo "=== VowVector Stack Verification ==="
echo ""

PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  printf "%-12s " "$name:"
  if curl -sf --max-time 5 "$url" > /dev/null 2>&1; then
    echo "OK"
    ((PASS++))
  else
    echo "FAIL"
    ((FAIL++))
  fi
}

check "Neo4j"    "http://localhost:7474"
check "Qdrant"   "http://localhost:6333/healthz"
check "Ollama"   "http://localhost:11434/api/tags"
check "Backend"  "http://localhost:8000/health"
check "Frontend" "http://localhost:5173"

echo ""
echo "=== Docker Containers ==="
docker_cmd docker compose -f "$COMPOSE_FILE" ps 2>/dev/null || docker_cmd docker ps --filter "name=vv-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== GPU Status (Ollama container) ==="
docker_cmd docker exec vv-ollama nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader 2>/dev/null || echo "GPU check unavailable"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
