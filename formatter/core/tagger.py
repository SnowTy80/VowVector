"""Auto-tagging for Neo4j metadata.

Detects document type, CSI trades/divisions, materials, and entities
from filename and content. Tags are used for future auto-connection
of nodes in Neo4j.
"""

import re
from dataclasses import dataclass, field

from config import CSI_DIVISIONS, DOC_TYPE_KEYWORDS, MATERIAL_KEYWORDS


@dataclass
class DocumentTags:
    """Collected tags from document analysis."""

    doc_type: str = "document"
    trades: list[str] = field(default_factory=list)
    materials: list[str] = field(default_factory=list)
    sections: list[str] = field(default_factory=list)
    flat_tags: list[str] = field(default_factory=list)


def detect_doc_type(filename: str, text: str) -> str:
    """Detect document type from filename keywords and content.

    Checks filename first, then scans content for keyword matches.
    Returns the best-matching doc_type string.
    """
    fn_lower = filename.lower()
    text_lower = text[:5000].lower()  # Only scan first 5000 chars for speed

    # Check filename first (higher confidence)
    for doc_type, keywords in DOC_TYPE_KEYWORDS.items():
        for kw in keywords:
            if kw in fn_lower:
                return doc_type

    # Fall back to content scanning — score by keyword matches
    scores: dict[str, int] = {}
    for doc_type, keywords in DOC_TYPE_KEYWORDS.items():
        count = sum(1 for kw in keywords if kw in text_lower)
        if count > 0:
            scores[doc_type] = count

    if scores:
        return max(scores, key=scores.get)

    return "document"


def extract_csi_trades(text: str) -> list[str]:
    """Find CSI MasterFormat division references in text.

    Looks for patterns like "Division 26", "Div 26", "Div. 26",
    "Section 26 05 00", and trade name keywords.
    """
    found = set()
    text_upper = text.upper()

    # Match "Division XX" / "Div XX" / "Div. XX"
    div_pattern = re.compile(
        r"(?:DIVISION|DIV\.?)\s*(\d{2})", re.IGNORECASE
    )
    for match in div_pattern.finditer(text):
        div_num = match.group(1)
        if div_num in CSI_DIVISIONS:
            found.add(f"Division {div_num} - {CSI_DIVISIONS[div_num]}")

    # Match "Section XX XX XX" or "XXXXXX" (6-digit CSI codes)
    section_pattern = re.compile(
        r"(?:SECTION\s+)?(\d{2})\s*(\d{2})\s*(\d{2})", re.IGNORECASE
    )
    for match in section_pattern.finditer(text):
        div_num = match.group(1)
        if div_num in CSI_DIVISIONS:
            found.add(f"Division {div_num} - {CSI_DIVISIONS[div_num]}")

    # Trade name keyword matching
    trade_keywords = {
        "electrical": "26",
        "plumbing": "22",
        "hvac": "23",
        "mechanical": "23",
        "fire suppression": "21",
        "fire alarm": "28",
        "concrete": "03",
        "masonry": "04",
        "structural steel": "05",
        "roofing": "07",
        "drywall": "09",
        "painting": "09",
        "flooring": "09",
        "earthwork": "31",
        "sitework": "32",
        "communications": "27",
        "elevator": "14",
    }

    for keyword, div_num in trade_keywords.items():
        if keyword.upper() in text_upper:
            if div_num in CSI_DIVISIONS:
                found.add(f"Division {div_num} - {CSI_DIVISIONS[div_num]}")

    return sorted(found)


def extract_sections(text: str) -> list[str]:
    """Extract specific CSI section numbers (e.g., 260500, 26 05 00)."""
    found = set()

    # "Section 26 05 00" style
    pattern = re.compile(r"(?:SECTION\s+)?(\d{2})\s+(\d{2})\s+(\d{2})", re.IGNORECASE)
    for match in pattern.finditer(text):
        section = f"{match.group(1)}{match.group(2)}{match.group(3)}"
        found.add(section)

    # Compact "260500" style (only in contexts that suggest section numbers)
    compact_pattern = re.compile(r"(?:SECTION|SEC\.?)\s*(\d{6})", re.IGNORECASE)
    for match in compact_pattern.finditer(text):
        found.add(match.group(1))

    return sorted(found)


def extract_materials(text: str) -> list[str]:
    """Extract material mentions using keyword matching."""
    found = set()
    text_lower = text.lower()

    for material in MATERIAL_KEYWORDS:
        # Word boundary match to avoid partial matches
        pattern = re.compile(r"\b" + re.escape(material) + r"\b", re.IGNORECASE)
        if pattern.search(text_lower):
            found.add(material)

    return sorted(found)


def tag_document(filename: str, text: str) -> DocumentTags:
    """Full tagging pipeline. Runs all detectors and returns DocumentTags."""
    doc_type = detect_doc_type(filename, text)
    trades = extract_csi_trades(text)
    materials = extract_materials(text)
    sections = extract_sections(text)

    # Build flat tag list for the tags[] field in JSON output
    flat_tags = []

    # File extension tag
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext:
        flat_tags.append(ext)

    # Doc type tag
    flat_tags.append(doc_type)

    # Trade tags (short form)
    for trade in trades:
        # "Division 26 - Electrical" -> "division-26"
        parts = trade.split(" - ")
        if parts:
            flat_tags.append(parts[0].lower().replace(" ", "-"))

    # Material tags (top 5 to avoid tag explosion)
    for mat in materials[:5]:
        flat_tags.append(f"material:{mat}")

    flat_tags.append("formatted")

    return DocumentTags(
        doc_type=doc_type,
        trades=trades,
        materials=materials,
        sections=sections,
        flat_tags=flat_tags,
    )
