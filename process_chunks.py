"""
Phase 4: Content Processing & Chunking — Prepare scraped content for vector embedding.

Reads procedure markdown files, parses frontmatter, cleans text,
and splits into chunks using RecursiveCharacterTextSplitter.
"""

import json
import re
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter

OUTPUT_DIR = Path("output")
PROCEDURES_DIR = OUTPUT_DIR / "procedures"
CHUNKS_FILE = OUTPUT_DIR / "chunks.jsonl"

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200


def parse_frontmatter(text):
    """Parse YAML frontmatter from markdown text. Returns (metadata_dict, body_text)."""
    match = re.match(r"^---\n(.*?)\n---\n\n?(.*)", text, re.DOTALL)
    if not match:
        return {}, text

    frontmatter_str = match.group(1)
    body = match.group(2)

    metadata = {}
    for line in frontmatter_str.split("\n"):
        m = re.match(r'^(\w[\w_]*)\s*:\s*"?(.*?)"?\s*$', line)
        if m:
            metadata[m.group(1)] = m.group(2)

    return metadata, body


def clean_text(text):
    """Clean markdown text for embedding."""
    # Normalize whitespace
    text = re.sub(r"\r\n", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Remove markdown link syntax but keep text
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    return text.strip()


def main():
    md_files = sorted(PROCEDURES_DIR.glob("*.md"))
    print(f"Found {len(md_files)} procedure files")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n## ", "\n### ", "\n\n", "\n", " "],
        length_function=len,
    )

    total_chunks = 0
    total_chars = 0

    with open(CHUNKS_FILE, "w", encoding="utf-8") as out:
        for md_file in md_files:
            text = md_file.read_text(encoding="utf-8")
            metadata, body = parse_frontmatter(text)

            if not body.strip():
                continue

            cleaned = clean_text(body)
            total_chars += len(cleaned)

            chunks = splitter.split_text(cleaned)

            for i, chunk in enumerate(chunks):
                record = {
                    "id": f"{md_file.stem}_chunk_{i}",
                    "text": chunk,
                    "metadata": {
                        "title": metadata.get("title", md_file.stem),
                        "category": metadata.get("category", ""),
                        "source_url": metadata.get("url", ""),
                        "content_url": metadata.get("content_url", ""),
                        "description": metadata.get("description", ""),
                        "date_modified": metadata.get("date_modified", ""),
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                    },
                }
                out.write(json.dumps(record, ensure_ascii=False) + "\n")
                total_chunks += 1

    print(f"\nProcessing complete:")
    print(f"  Procedures processed: {len(md_files)}")
    print(f"  Total chunks created: {total_chunks}")
    print(f"  Total characters:     {total_chars:,}")
    print(f"  Avg chunk size:       {total_chars // max(total_chunks, 1)} chars")
    print(f"  Output: {CHUNKS_FILE}")


if __name__ == "__main__":
    main()
