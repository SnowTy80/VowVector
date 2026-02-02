#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MODELS_ROOT="$REPO_ROOT/models"
GGUF_SOURCE="${NANONETS_GGUF_SOURCE:-}"
GGUF_TARGET="$MODELS_ROOT/ocr/Nanonets-OCR-s-Q8_0/Nanonets-OCR-s-Q8_0.gguf"

echo "========================================"
echo "  VowVector Data Formatter Setup"
echo "========================================"
echo ""

# 1. System dependencies (Tesseract OCR)
echo "[1/6] Checking Tesseract OCR..."
if command -v tesseract &>/dev/null; then
    echo "  Tesseract already installed: $(tesseract --version 2>&1 | head -1)"
else
    echo "  Installing tesseract-ocr..."
    sudo apt-get update -qq && sudo apt-get install -y -qq tesseract-ocr tesseract-ocr-eng
    echo "  Installed: $(tesseract --version 2>&1 | head -1)"
fi
echo ""

# 2. Create virtual environment
echo "[2/6] Creating virtual environment..."
if [ -d "$VENV_DIR" ] && [ ! -f "$VENV_DIR/bin/activate" ]; then
    echo "  Removing broken venv..."
    rm -rf "$VENV_DIR"
fi
if [ -d "$VENV_DIR" ]; then
    echo "  Venv already exists at $VENV_DIR"
else
    python3 -m venv "$VENV_DIR"
    echo "  Created venv at $VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
echo ""

# 3. Install Python dependencies
echo "[3/6] Installing Python dependencies..."
pip install --upgrade pip --quiet
pip install -r "$SCRIPT_DIR/requirements.txt" --quiet
echo "  Dependencies installed."
echo ""

# 4. Download spaCy model
echo "[4/6] Downloading spaCy English model (en_core_web_lg)..."
if python -c "import spacy; spacy.load('en_core_web_lg')" 2>/dev/null; then
    echo "  Model already installed."
else
    python -m spacy download en_core_web_lg --quiet
    echo "  Model downloaded."
fi
echo ""

# 5. Copy Nanonets GGUF model if available
echo "[5/6] Checking Nanonets OCR model..."
if [ -f "$GGUF_TARGET" ]; then
    echo "  Model already in place at $GGUF_TARGET"
elif [ -n "$GGUF_SOURCE" ] && [ -f "$GGUF_SOURCE" ]; then
    echo "  Copying Nanonets GGUF model (3+ GB)..."
    mkdir -p "$(dirname "$GGUF_TARGET")"
    cp "$GGUF_SOURCE" "$GGUF_TARGET"
    echo "  Copied to $GGUF_TARGET"
else
    echo "  Nanonets GGUF not found."
    echo "  (Optional: set NANONETS_GGUF_SOURCE=/path/to/Nanonets-OCR-s-Q8_0.gguf and re-run setup.)"
fi
echo ""

# 6. Create output directory
echo "[6/6] Creating output directory..."
mkdir -p "$SCRIPT_DIR/output"
echo "  Output directory: $SCRIPT_DIR/output"
echo ""

echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "To run the Data Formatter:"
echo ""
echo "  source $VENV_DIR/bin/activate"
echo "  streamlit run $SCRIPT_DIR/app.py"
echo ""
