#!/bin/bash
# Load the local nomic-embed-text GGUF into Ollama
set -e

echo "=== VowVector: Ollama Model Init ==="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
ENV_EXAMPLE="$REPO_ROOT/.env.example"

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

OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"

docker_cmd() {
  if docker info &>/dev/null 2>&1; then
    "$@"
  else
    sg docker -c "$(printf '%q ' "$@")"
  fi
}

echo "Waiting for Ollama to be ready..."
until curl -sf "${OLLAMA_BASE_URL}/api/tags" > /dev/null 2>&1; do
  printf "."
  sleep 2
done
echo " Ready!"

# Check if model already exists
if curl -sf "${OLLAMA_BASE_URL}/api/tags" | grep -q "nomic-embed-text"; then
  echo "Model nomic-embed-text:v1.5 already loaded."
else
  MODEL_PATH="/models/embed/nomic-embed-text-v1.5.Q4_K_M.gguf"
  if docker_cmd docker exec vv-ollama test -f "$MODEL_PATH"; then
    echo "Creating Modelfile inside container..."
    docker_cmd docker exec vv-ollama bash -c "echo \"FROM ${MODEL_PATH}\" > /tmp/Modelfile"

    echo "Creating nomic-embed-text:v1.5 from local GGUF..."
    docker_cmd docker exec vv-ollama ollama create nomic-embed-text:v1.5 -f /tmp/Modelfile
    echo ""
    echo "Model created."
  else
    echo "Local GGUF not found at ${MODEL_PATH}."
    echo "Pulling nomic-embed-text:v1.5 from Ollama registry..."
    docker_cmd docker exec vv-ollama ollama pull nomic-embed-text:v1.5
  fi
fi

echo ""
echo "Available models:"
curl -s "${OLLAMA_BASE_URL}/api/tags" | python3 -m json.tool 2>/dev/null || \
  curl -s "${OLLAMA_BASE_URL}/api/tags"

echo ""
echo "Testing embedding generation..."
RESULT=$(curl -s "${OLLAMA_BASE_URL}/api/embed" -d '{
  "model": "nomic-embed-text:v1.5",
  "input": "VowVector brainstormer test embedding"
}')

DIM=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['embeddings'][0]))" 2>/dev/null)

if [ "$DIM" = "768" ]; then
  echo "SUCCESS: Embedding dimension = $DIM"
else
  echo "WARNING: Expected 768 dimensions, got: $DIM"
  echo "Raw response: $RESULT"
fi
