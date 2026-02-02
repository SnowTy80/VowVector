"""Central configuration for VowVector Data Formatter."""

from pathlib import Path
import os

# ── Paths ──
PROJECT_ROOT = Path(__file__).resolve().parent
REPO_ROOT = PROJECT_ROOT.parent
MODELS_ROOT = REPO_ROOT / "models"
GGUF_OCR_DIR = MODELS_ROOT / "ocr" / "Nanonets-OCR-s-Q8_0"
GGUF_OCR_FILE = GGUF_OCR_DIR / "Nanonets-OCR-s-Q8_0.gguf"
_NANONETS_SOURCE = os.getenv("NANONETS_GGUF_SOURCE", "").strip()
NANONETS_GGUF_SOURCE = Path(_NANONETS_SOURCE) if _NANONETS_SOURCE else None
OUTPUT_DIR = PROJECT_ROOT / "output"

# ── Chunking (must match backend) ──
CHUNK_SIZE = 3000
CHUNK_OVERLAP = 200
MAX_CONTENT_CHARS = 500_000  # Safety cap for very large documents

# ── OCR ──
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
NANONETS_MODEL_NAME = "nanonets-ocr:q8"
TESSERACT_LANG = "eng"
OCR_DPI = 300

# ── Sanitization regex patterns ──
DOLLAR_PATTERN = r"\$[\d,]+\.?\d*"
PHONE_PATTERN = r"(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"
SSN_PATTERN = r"\d{3}-\d{2}-\d{4}"
EMAIL_PATTERN = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
ADDRESS_PATTERN = (
    r"\d+\s+[\w\s]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road"
    r"|Ln|Lane|Way|Ct|Court|Pl|Place)\.?"
    r"(?:\s*,?\s*(?:Suite|Ste|Apt|Unit|#)\s*\w+)?"
)

# ── CSI MasterFormat divisions ──
CSI_DIVISIONS = {
    "01": "General Requirements",
    "02": "Existing Conditions",
    "03": "Concrete",
    "04": "Masonry",
    "05": "Metals",
    "06": "Wood/Plastics/Composites",
    "07": "Thermal/Moisture Protection",
    "08": "Openings",
    "09": "Finishes",
    "10": "Specialties",
    "11": "Equipment",
    "12": "Furnishings",
    "13": "Special Construction",
    "14": "Conveying Equipment",
    "21": "Fire Suppression",
    "22": "Plumbing",
    "23": "HVAC",
    "25": "Integrated Automation",
    "26": "Electrical",
    "27": "Communications",
    "28": "Electronic Safety/Security",
    "31": "Earthwork",
    "32": "Exterior Improvements",
    "33": "Utilities",
}

# ── Document type keywords ──
DOC_TYPE_KEYWORDS = {
    "spec": ["specification", "spec", "section", "division"],
    "bid": ["bid", "proposal", "quotation", "quote", "estimate"],
    "drawing": ["drawing", "dwg", "plan", "elevation", "detail"],
    "rfi": ["rfi", "request for information"],
    "submittal": ["submittal", "submission", "shop drawing"],
    "schedule": ["schedule", "timeline", "milestone"],
    "contract": ["contract", "agreement", "terms", "conditions"],
    "report": ["report", "analysis", "study", "assessment"],
    "letter": ["letter", "correspondence", "memo", "memorandum"],
    "invoice": ["invoice", "payment", "billing"],
    "takeoff": ["takeoff", "take-off", "quantity", "bom", "bill of materials"],
}

# ── Construction materials for tagging ──
MATERIAL_KEYWORDS = [
    "steel", "concrete", "copper", "aluminum", "pvc", "hdpe", "abs",
    "drywall", "gypsum", "insulation", "fiberglass", "lumber", "plywood",
    "rebar", "conduit", "pipe", "wire", "cable", "duct", "ductwork",
    "brick", "block", "mortar", "grout", "sealant", "caulk", "adhesive",
    "glass", "glazing", "roofing", "membrane", "flashing", "shingle",
    "tile", "ceramic", "porcelain", "vinyl", "laminate", "carpet",
    "paint", "primer", "coating", "stain", "epoxy", "polyurethane",
    "transformer", "switchgear", "panel", "breaker", "receptacle",
    "fixture", "luminaire", "ballast", "led", "valve", "pump", "motor",
    "compressor", "boiler", "chiller", "ahu", "vav", "diffuser",
    "sprinkler", "fire alarm", "detector", "thermostat", "sensor",
]

# ── Supported file extensions ──
SUPPORTED_EXTENSIONS = {
    ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".csv", ".txt", ".md",
    ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".webp",
}

# ── Node types available for user selection (from backend node.py) ──
NODE_TYPES = ["Note", "Code", "AIInteraction", "Research", "Project", "Concept"]

# ── Formatter version ──
FORMATTER_VERSION = "1.0.0"
