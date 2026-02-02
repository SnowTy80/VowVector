"""VowVector Data Formatter — Streamlit application.

Preprocessing tool for ingesting raw documents, extracting text (with OCR),
sanitizing PII, auto-tagging for Neo4j, and outputting structured JSON files
compatible with the VowVector pipeline.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import streamlit as st

# Ensure project root is on sys.path so 'config' and 'core' are importable
_project_root = Path(__file__).parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from config import (
    FORMATTER_VERSION,
    NODE_TYPES,
    OUTPUT_DIR,
    SUPPORTED_EXTENSIONS,
)
from core.chunker import chunk_text, compute_ctx_metadata
from core.extractor import extract_text
from core.sanitizer import Sanitizer
from core.tagger import tag_document

# ── Page config ──

st.set_page_config(
    page_title="VowVector Data Formatter",
    page_icon="V",
    layout="wide",
)


# ── Session state defaults ──

def _init_state():
    defaults = {
        "processed_results": [],
        "sanitizer": None,
    }
    for key, val in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = val


_init_state()


# ── Sidebar ──

def render_sidebar():
    st.sidebar.header("VowVector Data Formatter")
    st.sidebar.markdown("---")

    # File upload
    st.sidebar.subheader("Input Files")
    uploaded_files = st.sidebar.file_uploader(
        "Upload files",
        accept_multiple_files=True,
        type=[ext.lstrip(".") for ext in SUPPORTED_EXTENSIONS],
    )

    # Folder path input
    folder_path = st.sidebar.text_input(
        "Or enter folder path",
        placeholder="/path/to/documents",
    )

    st.sidebar.markdown("---")

    # Node type selection
    st.sidebar.subheader("Node Type")
    node_type = st.sidebar.selectbox(
        "Assign node type for this batch",
        options=NODE_TYPES,
        index=NODE_TYPES.index("Research"),
        help="This determines which Qdrant collection the documents will be stored in.",
    )

    st.sidebar.markdown("---")

    # OCR settings
    st.sidebar.subheader("OCR Settings")
    enable_ocr = st.sidebar.checkbox("Enable OCR for scanned documents", value=True)
    force_ocr = st.sidebar.checkbox(
        "Graphical PDF (force OCR all pages)",
        value=False,
        help="Use for construction drawings, plans, and other image-heavy PDFs "
             "where the text layer only contains title block stamps.",
    )
    ocr_engine = st.sidebar.radio(
        "OCR engine",
        options=["tesseract", "nanonets"],
        index=0,
        help="Tesseract is the default (no GPU). Nanonets requires Ollama running.",
    )

    if ocr_engine == "nanonets":
        from core.ocr import is_nanonets_available

        available = is_nanonets_available()
        if available:
            st.sidebar.success("Nanonets model is loaded in Ollama")
        else:
            st.sidebar.warning(
                "Nanonets model not found in Ollama. "
                "Use the setup button below or switch to Tesseract."
            )
            if st.sidebar.button("Setup Nanonets in Ollama"):
                from core.ocr import setup_nanonets_model

                with st.spinner("Loading Nanonets model into Ollama..."):
                    ok = setup_nanonets_model()
                if ok:
                    st.sidebar.success("Model loaded!")
                    st.rerun()
                else:
                    st.sidebar.error("Failed to load model. Check Ollama is running.")

    st.sidebar.markdown("---")

    # Sanitization settings
    st.sidebar.subheader("Sanitization")
    enable_sanitization = st.sidebar.checkbox("Enable PII redaction", value=True)

    sanitize_names = True
    sanitize_orgs = True
    sanitize_dollars = True
    sanitize_addresses = True
    sanitize_phones = True

    if enable_sanitization:
        sanitize_names = st.sidebar.checkbox("Redact person names", value=True)
        sanitize_orgs = st.sidebar.checkbox("Redact organization names", value=True)
        sanitize_dollars = st.sidebar.checkbox("Redact dollar amounts", value=True)
        sanitize_addresses = st.sidebar.checkbox("Redact addresses", value=True)
        sanitize_phones = st.sidebar.checkbox("Redact phone numbers", value=True)

    st.sidebar.markdown("---")

    # Output directory
    st.sidebar.subheader("Output")
    output_dir = st.sidebar.text_input(
        "Output directory",
        value=str(OUTPUT_DIR),
        help="Where to save the formatted JSON files.",
    )

    # Process button
    st.sidebar.markdown("---")
    process_clicked = st.sidebar.button(
        "Process Files",
        type="primary",
        use_container_width=True,
    )

    return {
        "uploaded_files": uploaded_files,
        "folder_path": folder_path,
        "node_type": node_type,
        "enable_ocr": enable_ocr,
        "force_ocr": force_ocr,
        "ocr_engine": ocr_engine,
        "enable_sanitization": enable_sanitization,
        "sanitize_names": sanitize_names,
        "sanitize_orgs": sanitize_orgs,
        "sanitize_dollars": sanitize_dollars,
        "sanitize_addresses": sanitize_addresses,
        "sanitize_phones": sanitize_phones,
        "output_dir": output_dir,
        "process_clicked": process_clicked,
    }


# ── File collection ──

def collect_files(uploaded_files, folder_path: str) -> list[Path]:
    """Collect files from uploads and/or folder path.

    For uploaded files, saves them to a temp directory first.
    For folder paths, recursively globs for supported extensions.
    """
    files = []
    temp_dir = _project_root / ".tmp_uploads"

    # Handle uploaded files
    if uploaded_files:
        temp_dir.mkdir(exist_ok=True)
        for uf in uploaded_files:
            dest = temp_dir / uf.name
            dest.write_bytes(uf.getbuffer())
            files.append(dest)

    # Handle folder path
    if folder_path and Path(folder_path).is_dir():
        folder = Path(folder_path)
        for ext in SUPPORTED_EXTENSIONS:
            files.extend(folder.rglob(f"*{ext}"))

    return files


# ── Single file processing ──

def process_single_file(file_path: Path, settings: dict) -> dict:
    """Process one file through the full pipeline.

    Returns the output JSON dict.
    """
    # 1. Extract text
    doc = extract_text(
        file_path,
        use_ocr=settings["enable_ocr"],
        ocr_engine=settings["ocr_engine"],
        force_ocr=settings["force_ocr"],
    )

    if not doc.raw_text.strip():
        return {
            "error": f"No text extracted from {file_path.name}",
            "source_file": file_path.name,
            "warnings": doc.warnings,
        }

    # 2. Tag document
    tags = tag_document(file_path.name, doc.raw_text)

    # 3. Sanitize if enabled
    text_for_output = doc.raw_text
    redaction_count = 0

    if settings["enable_sanitization"]:
        entity_types = []
        if settings["sanitize_names"]:
            entity_types.append("PERSON")
        if settings["sanitize_orgs"]:
            entity_types.append("ORGANIZATION")
        if settings["sanitize_phones"]:
            entity_types.append("PHONE_NUMBER")
        if settings["sanitize_dollars"]:
            pass  # Handled by regex layer
        if settings["sanitize_addresses"]:
            entity_types.append("LOCATION")

        # Add standard types
        entity_types.extend(["EMAIL_ADDRESS", "US_SSN", "CREDIT_CARD"])

        sanitizer = Sanitizer(
            use_presidio=bool(entity_types),
            use_regex=True,
            entity_types=entity_types if entity_types else None,
        )
        result = sanitizer.sanitize(text_for_output)
        text_for_output = result.sanitized_text
        redaction_count = result.redaction_count

    # 4. Chunk text
    # Prepend title like backend does: embed_text = f"{title}\n\n{text}"
    title = _derive_title(file_path.name)
    embed_text = f"{title}\n\n{text_for_output}"
    chunks = chunk_text(embed_text)
    if not chunks:
        chunks = [embed_text]
    ctx_meta = compute_ctx_metadata(text_for_output, chunks)

    # 5. Build output JSON
    file_size = file_path.stat().st_size

    output = {
        "title": title,
        "content": text_for_output,
        "node_type": settings["node_type"],
        "tags": tags.flat_tags,
        "metadata": {
            "source_file": file_path.name,
            "file_size": file_size,
            **ctx_meta,
            "doc_type": tags.doc_type,
            "extraction_method": doc.extraction_method,
            "page_count": doc.page_count,
            "sanitized": settings["enable_sanitization"],
            "redaction_count": redaction_count,
            "trades": tags.trades,
            "materials": tags.materials,
            "sections": tags.sections,
            "formatter_version": FORMATTER_VERSION,
            "processed_at": datetime.now(timezone.utc).isoformat(),
        },
        "chunks": chunks,
    }

    if doc.warnings:
        output["metadata"]["warnings"] = doc.warnings

    return output


def _derive_title(filename: str) -> str:
    """Create a readable title from filename (matching backend pattern)."""
    stem = Path(filename).stem
    return stem.replace("_", " ").replace("-", " ").title()


# ── Main UI ──

def main():
    settings = render_sidebar()

    # Header
    st.title("Data Formatter")
    st.caption(
        "Preprocess documents for VowVector: extract text, sanitize PII, "
        "auto-tag, and output structured JSON."
    )

    if not settings["process_clicked"]:
        # Show instructions when idle
        st.info(
            "Upload files or enter a folder path in the sidebar, "
            "configure settings, then click **Process Files**."
        )

        # Show previous results if any
        if st.session_state["processed_results"]:
            st.markdown("---")
            st.subheader("Previous Results")
            _render_results(st.session_state["processed_results"], settings["output_dir"])
        return

    # Collect files
    files = collect_files(settings["uploaded_files"], settings["folder_path"])

    if not files:
        st.warning("No files found. Upload files or provide a valid folder path.")
        return

    # Process files
    st.subheader(f"Processing {len(files)} file(s)")
    progress_bar = st.progress(0)
    status_text = st.empty()
    results = []

    for i, file_path in enumerate(files):
        status_text.text(f"Processing: {file_path.name}")
        try:
            result = process_single_file(file_path, settings)
            result["_status"] = "error" if "error" in result else "success"
            results.append(result)
        except Exception as e:
            results.append({
                "_status": "error",
                "error": str(e),
                "source_file": file_path.name,
            })
        progress_bar.progress((i + 1) / len(files))

    status_text.text("Processing complete!")
    st.session_state["processed_results"] = results

    # Render results
    _render_results(results, settings["output_dir"])


def _render_results(results: list[dict], output_dir: str):
    """Display processing results and save options."""
    success = [r for r in results if r.get("_status") == "success"]
    errors = [r for r in results if r.get("_status") == "error"]

    col1, col2 = st.columns(2)
    col1.metric("Successful", len(success))
    col2.metric("Errors", len(errors))

    # Show errors
    if errors:
        with st.expander(f"Errors ({len(errors)})", expanded=True):
            for err in errors:
                st.error(f"**{err.get('source_file', 'Unknown')}**: {err.get('error', 'Unknown error')}")

    # Show successful results
    if success:
        st.markdown("---")

        # Tabs for each result
        tab_names = [r.get("title", r.get("source_file", "Unknown"))[:40] for r in success]
        tabs = st.tabs(tab_names) if len(tab_names) > 1 else [st.container()]

        for tab, result in zip(tabs, success):
            with tab:
                _render_single_result(result)

        # Save all button
        st.markdown("---")
        col_save, col_download = st.columns(2)

        with col_save:
            if st.button("Save All to Output Directory", type="primary", use_container_width=True):
                _save_results(success, output_dir)

        with col_download:
            # Download as single JSON array
            clean_results = [{k: v for k, v in r.items() if not k.startswith("_")} for r in success]
            json_str = json.dumps(clean_results, indent=2, ensure_ascii=False)
            st.download_button(
                "Download All as JSON",
                data=json_str,
                file_name="formatted_documents.json",
                mime="application/json",
                use_container_width=True,
            )


def _render_single_result(result: dict):
    """Render a single processed document result."""
    meta = result.get("metadata", {})

    # Metadata summary
    mcol1, mcol2, mcol3, mcol4 = st.columns(4)
    mcol1.metric("Doc Type", meta.get("doc_type", "unknown"))
    mcol2.metric("Pages", meta.get("page_count", 1))
    mcol3.metric("Chunks", meta.get("chunk_count", 0))
    mcol4.metric("Redactions", meta.get("redaction_count", 0))

    # Tags
    tags = result.get("tags", [])
    if tags:
        st.markdown("**Tags:** " + " ".join(f"`{t}`" for t in tags))

    # Trades
    trades = meta.get("trades", [])
    if trades:
        st.markdown("**Trades:** " + ", ".join(trades))

    # Materials
    materials = meta.get("materials", [])
    if materials:
        st.markdown("**Materials:** " + ", ".join(materials[:10]))

    # Warnings
    warnings = meta.get("warnings", [])
    if warnings:
        for w in warnings:
            st.warning(w)

    # Text preview
    with st.expander("Text Preview (first 2000 chars)"):
        content = result.get("content", "")
        st.text(content[:2000])

    # JSON preview
    with st.expander("JSON Output"):
        clean = {k: v for k, v in result.items() if not k.startswith("_")}
        # Truncate content and chunks for display
        display = dict(clean)
        if len(display.get("content", "")) > 500:
            display["content"] = display["content"][:500] + "... [truncated]"
        if display.get("chunks"):
            display["chunks"] = [
                c[:200] + "..." if len(c) > 200 else c
                for c in display["chunks"][:3]
            ]
            if len(clean.get("chunks", [])) > 3:
                display["chunks"].append(f"... +{len(clean['chunks']) - 3} more chunks")
        st.json(display)


def _save_results(results: list[dict], output_dir: str):
    """Save each result as an individual JSON file to the output directory."""
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    saved = 0
    for result in results:
        clean = {k: v for k, v in result.items() if not k.startswith("_")}
        source = clean.get("metadata", {}).get("source_file", "unknown")
        stem = Path(source).stem
        filename = f"{stem}_formatted.json"
        filepath = out_path / filename

        # Avoid overwriting — append counter if needed
        counter = 1
        while filepath.exists():
            filename = f"{stem}_formatted_{counter}.json"
            filepath = out_path / filename
            counter += 1

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(clean, f, indent=2, ensure_ascii=False)
        saved += 1

    st.success(f"Saved {saved} file(s) to `{output_dir}`")


if __name__ == "__main__":
    main()
