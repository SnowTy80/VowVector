"""Auto-tagger for conversation data.

Extracts content-based tags from conversation title and messages
using keyword matching. No ML dependencies — pure string operations.
"""

import re
from collections import Counter

STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "it", "as", "be", "was", "are",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can", "need",
    "this", "that", "these", "those", "i", "me", "my", "we", "our",
    "you", "your", "he", "she", "they", "them", "its", "his", "her",
    "their", "what", "which", "who", "when", "where", "how", "not",
    "no", "so", "if", "then", "than", "too", "very", "just", "about",
    "up", "out", "all", "also", "into", "over", "after", "before",
    "between", "under", "through", "during", "each", "some", "any",
    "both", "here", "there", "again", "once", "more", "most", "other",
    "only", "same", "such", "few", "own", "back", "even", "new", "way",
    "use", "using", "used", "get", "got", "make", "made", "like",
})

# --- Layer 2: Domain keyword dictionaries ---

DOMAIN_KEYWORDS: dict[str, list[str]] = {
    # Software domains
    "domain:webdev": [
        "react", "vue", "angular", "html", "css", "frontend", "nextjs",
        "svelte", "tailwind", "dom", "webpack", "vite", "sass", "scss",
        "responsive", "jsx", "tsx", "component",
    ],
    "domain:backend": [
        "fastapi", "flask", "django", "express", "api", "endpoint",
        "middleware", "rest", "graphql", "server", "route", "handler",
        "uvicorn", "gunicorn",
    ],
    "domain:database": [
        "sql", "postgres", "postgresql", "neo4j", "mongodb", "qdrant",
        "redis", "database", "query", "schema", "migration", "index",
        "cypher", "nosql", "sqlite",
    ],
    "domain:devops": [
        "docker", "kubernetes", "ci/cd", "nginx", "deploy", "terraform",
        "ansible", "pipeline", "container", "dockerfile", "compose",
        "github actions", "jenkins",
    ],
    "domain:ml": [
        "machine learning", "neural", "training", "model", "pytorch",
        "tensorflow", "embedding", "llm", "transformer", "fine-tune",
        "dataset", "inference", "gpu", "cuda", "deep learning",
    ],
    "domain:python": [
        "python", "pip", "pytest", "pydantic", "asyncio", "decorator",
        "virtualenv", "poetry", "conda", "pandas", "numpy", "flask",
        "django", "fastapi",
    ],
    "domain:javascript": [
        "javascript", "typescript", "node", "npm", "webpack", "vite",
        "es6", "promise", "async/await", "yarn", "deno", "bun",
    ],
    "domain:rust": [
        "rust", "cargo", "borrow checker", "lifetime", "unsafe",
        "tokio", "serde", "crate",
    ],
    "domain:systems": [
        "linux", "bash", "shell", "kernel", "filesystem", "process",
        "socket", "network", "tcp", "udp", "systemd", "ssh",
        "command line", "terminal",
    ],
    "domain:3d": [
        "three.js", "threejs", "webgl", "shader", "mesh", "scene",
        "3d", "opengl", "vulkan", "blender", "unity", "unreal",
    ],
    "domain:data": [
        "pandas", "dataframe", "csv", "json", "parsing", "scraping",
        "etl", "data pipeline", "excel", "spreadsheet", "visualization",
    ],
    "domain:security": [
        "auth", "oauth", "jwt", "encryption", "ssl", "tls", "password",
        "token", "firewall", "vulnerability", "certificate",
    ],
    "domain:design": [
        "ui", "ux", "figma", "layout", "typography", "color scheme",
        "wireframe", "mockup", "prototype", "accessibility",
    ],
    # Construction domains
    "domain:electrical": [
        "electrical", "wiring", "conduit", "circuit", "panel", "breaker",
        "voltage", "amperage", "switchgear", "transformer", "nec",
        "receptacle", "lighting", "conductor", "raceway", "division 26",
    ],
    "domain:plumbing": [
        "plumbing", "pipe", "drain", "fixture", "valve", "water heater",
        "sewer", "backflow", "copper", "pvc", "division 22",
    ],
    "domain:hvac": [
        "hvac", "ductwork", "air handler", "chiller", "boiler",
        "thermostat", "refrigerant", "ventilation", "btu", "tonnage",
        "division 23",
    ],
    "domain:concrete": [
        "concrete", "rebar", "formwork", "footing", "foundation", "slab",
        "pour", "psi", "mix design", "curing", "flatwork",
    ],
    "domain:structural": [
        "structural", "steel", "beam", "column", "truss", "framing",
        "load bearing", "shear wall", "joist", "girder",
    ],
    "domain:estimating": [
        "estimate", "takeoff", "bid", "proposal", "cost", "material list",
        "labor", "markup", "overhead", "profit", "change order",
        "scope of work", "specifications",
    ],
    "domain:project-mgmt": [
        "schedule", "submittal", "rfi", "punch list", "milestone",
        "gantt", "critical path", "subcontractor", "general contractor",
        "project manager", "superintendent",
    ],
    "domain:safety": [
        "osha", "safety", "ppe", "harness", "lockout", "tagout",
        "fall protection", "hazard", "incident",
    ],
    "domain:roofing": [
        "roofing", "shingle", "membrane", "flashing", "gutter",
        "soffit", "fascia", "underlayment", "tpo", "epdm",
    ],
    "domain:landscaping": [
        "landscaping", "grading", "irrigation", "drainage", "retaining wall",
        "topsoil", "sod", "hardscape", "paver",
    ],
}

# --- Layer 3: Intent patterns ---

INTENT_PATTERNS: dict[str, list[str]] = {
    "intent:debug": [
        "error", "bug", "fix", "broken", "not working", "traceback",
        "exception", "fails", "crash", "issue", "problem", "wrong",
        "unexpected", "stack trace",
    ],
    "intent:build": [
        "create", "build", "implement", "make", "set up", "scaffold",
        "generate", "write a", "add a", "develop", "new feature",
    ],
    "intent:learn": [
        "explain", "how does", "what is", "why does", "understand",
        "difference between", "tutorial", "help me understand",
        "can you teach", "walk me through",
    ],
    "intent:refactor": [
        "refactor", "improve", "optimize", "clean up", "simplify",
        "restructure", "reorganize", "better way",
    ],
    "intent:config": [
        "configure", "config", "setup", "install", "environment",
        "docker-compose", "settings", "yaml", "env file",
    ],
    "intent:draft": [
        "write", "draft", "compose", "email", "letter", "proposal",
        "template", "document", "narrative", "report",
    ],
}

_WORD_RE = re.compile(r"[a-z0-9]+(?:['/.-][a-z0-9]+)*")


def _clean_words(text: str) -> list[str]:
    """Lowercase and extract word tokens."""
    return _WORD_RE.findall(text.lower())


def _title_tags(title: str) -> list[str]:
    """Layer 1: extract topic tags from conversation title."""
    words = _clean_words(title)
    words = [w for w in words if w not in STOPWORDS and len(w) > 1]

    tags = [f"topic:{w}" for w in words]

    # Bigrams
    for i in range(len(words) - 1):
        tags.append(f"topic:{words[i]}-{words[i + 1]}")

    return tags


def _domain_tags(content: str) -> list[str]:
    """Layer 2: detect domains via keyword matching on content."""
    sample = content[:5000].lower()
    tags = []

    for domain, keywords in DOMAIN_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in sample)
        if hits >= 2:
            tags.append(domain)

    return tags


def _intent_tag(user_text: str) -> str:
    """Layer 3: classify intent from user messages."""
    sample = user_text[:3000].lower()

    best_intent = "intent:general"
    best_hits = 0

    for intent, patterns in INTENT_PATTERNS.items():
        hits = sum(1 for p in patterns if p in sample)
        if hits >= 2 and hits > best_hits:
            best_hits = hits
            best_intent = intent

    return best_intent


def _depth_tag(message_count: int) -> str:
    """Layer 4: conversation depth based on message count."""
    if message_count <= 4:
        return "depth:quick"
    if message_count <= 15:
        return "depth:medium"
    return "depth:deep"


def extract_conversation_tags(
    title: str,
    messages: list[dict],
) -> list[str]:
    """Extract content-based tags from a conversation.

    Args:
        title: Conversation title string.
        messages: List of message dicts with 'role' and 'text' keys.

    Returns:
        Deduplicated list of tag strings.
    """
    tags: list[str] = []

    # Layer 1: title keywords
    tags.extend(_title_tags(title))

    # Build content text for scanning
    all_text = " ".join(m.get("text", "") for m in messages)
    user_text = " ".join(
        m.get("text", "") for m in messages if m.get("role") == "user"
    )

    # Layer 2: domain detection
    tags.extend(_domain_tags(all_text))

    # Layer 3: intent classification
    tags.append(_intent_tag(user_text))

    # Layer 4: depth
    tags.append(_depth_tag(len(messages)))

    # Deduplicate preserving order
    seen: set[str] = set()
    result: list[str] = []
    for t in tags:
        if t not in seen:
            seen.add(t)
            result.append(t)

    return result
