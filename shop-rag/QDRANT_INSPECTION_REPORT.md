# Qdrant Inspection Report

Generated: 2026-04-28T17:32:22.417609+00:00
Qdrant URL: `http://127.0.0.1:6333`
Connection status: connected

## Collections

### `icbc_procedures`

- Point count: `1762`
- Vector names: `default`
- Vector dimensions: `{'default': 384}`
- Distance metrics: `{'default': 'Cosine'}`
- Sampled points: `8`
- Payload fields: `id, chunk_id, text, metadata, metadata.title, metadata.category, metadata.source_url, metadata.content_url, metadata.description, metadata.date_modified, metadata.chunk_index, metadata.total_chunks, embedding_model, title, category, source_url, content_url, description, date_modified, chunk_index, total_chunks`
- Likely text fields: `text`
- Likely title fields: `metadata.title, title`
- Likely source URL fields: `metadata.source_url, metadata.content_url, source_url, content_url`
- Likely category / policy / section fields: `metadata.category, category`
- Likely scrape timestamp fields: `metadata.date_modified, date_modified`
- Other metadata fields: `id, chunk_id, metadata, metadata.description, metadata.chunk_index, metadata.total_chunks, embedding_model, description, chunk_index, total_chunks, sample_point_ids`
- Detected embedding model: `all-MiniLM-L6-v2`
