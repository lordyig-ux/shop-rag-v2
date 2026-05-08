from __future__ import annotations

import argparse
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.config import get_settings  # noqa: E402
from app.core.logging import configure_logging  # noqa: E402
from app.qdrant.client import create_qdrant_client  # noqa: E402
from app.qdrant.importer import (  # noqa: E402
    DEFAULT_IMPORT_COLLECTION,
    DEFAULT_IMPORT_EMBEDDING_MODEL,
    QdrantChunkImporter,
    SentenceTransformerEmbeddingProvider,
)


def main() -> int:
    settings = get_settings()
    configure_logging(settings)
    parser = _build_parser(settings.local_chunks_path)
    args = parser.parse_args()

    chunks_path = Path(args.chunks_path).resolve()
    collection_name = args.collection or settings.selected_collection or DEFAULT_IMPORT_COLLECTION
    embedding_model = args.embedding_model or settings.query_embedding_model or DEFAULT_IMPORT_EMBEDDING_MODEL

    print("Importing ICBC chunks into Qdrant")
    print(f"Chunks file: {chunks_path}")
    print(f"Qdrant URL: {settings.qdrant_url}")
    print(f"Collection: {collection_name}")
    print(f"Embedding model: {embedding_model}")
    if args.limit:
        print(f"Limit: {args.limit} chunks")

    if not chunks_path.exists():
        print(f"ERROR: chunks file does not exist: {chunks_path}")
        return 1

    client = create_qdrant_client(settings)
    importer = QdrantChunkImporter(
        client=client,
        embedding_provider=SentenceTransformerEmbeddingProvider(embedding_model),
        collection_name=collection_name,
        batch_size=args.batch_size,
        recreate=args.recreate,
    )
    result = importer.import_file(chunks_path, limit=args.limit)

    print("")
    print("Import complete.")
    print(f"Imported points: {result.imported_points}")
    print(f"Vector size: {result.vector_size}")
    print("")
    print("Recommended .env settings:")
    print(f"QDRANT_COLLECTION={result.collection_name}")
    print(f"QUERY_EMBEDDING_MODEL={result.embedding_model}")
    print("")
    print("Next: restart the shop-rag app so it reloads .env, then ask a test question.")
    return 0


def _build_parser(default_chunks_path: Path) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Import the scraped ICBC chunks.jsonl file into a local Qdrant collection."
    )
    parser.add_argument(
        "--chunks-path",
        default=str(default_chunks_path),
        help=f"Path to chunks.jsonl. Default: {default_chunks_path}",
    )
    parser.add_argument(
        "--collection",
        default=DEFAULT_IMPORT_COLLECTION,
        help=f"Qdrant collection name. Default: {DEFAULT_IMPORT_COLLECTION}",
    )
    parser.add_argument(
        "--embedding-model",
        default=DEFAULT_IMPORT_EMBEDDING_MODEL,
        help=f"SentenceTransformers model for chunk and query embeddings. Default: {DEFAULT_IMPORT_EMBEDDING_MODEL}",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=64,
        help="Number of chunks to embed and upload at a time. Default: 64",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional test limit, for example --limit 100.",
    )
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="Delete and recreate the collection before importing. Only use this for a collection you are replacing.",
    )
    return parser


if __name__ == "__main__":
    raise SystemExit(main())
