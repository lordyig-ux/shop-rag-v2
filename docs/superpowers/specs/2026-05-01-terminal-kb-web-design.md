# Terminal KB Web App Design

## Goal

Build a public-safe V1 proof of concept for Terminal Auto Body employees to search SOP and insurance-policy knowledge from an internet-hosted app.

## Decisions

- V1 uses public-safe documents only.
- V1 has no authentication.
- V1 is built as a new Next.js app under `web/`.
- Convex stores normalized sources, chunks, search logs, and feedback.
- Vercel hosts the Next.js frontend and API routes.
- Ollama Cloud provides optional AI answer synthesis through an environment-configurable model.
- The existing Python/FastAPI app remains as a reference implementation and local data source.
- V2 adds Clerk authentication and app-side email-domain enforcement for `terminalauto.ca` and `valleycollision.ca`.

## User Workflow

1. Staff opens the web app.
2. Staff types a question such as "What is the aluminum repair SOP?"
3. The app searches indexed public-safe chunks.
4. The app returns either an AI-composed answer with citations or source excerpts if AI is unavailable.
5. Staff opens source citations to verify the answer.

## Admin Workflow For V1

V1 does not include a hosted admin document uploader. Public-safe documents are imported by a local script from `output/chunks.jsonl` or another JSONL file. This keeps the proof of concept small, safe, and reviewable.

## Architecture

The Next.js app owns the user experience, routing, styling, and optional API route for Ollama Cloud answer synthesis. Convex owns the persistent document and chunk data plus search actions. The ingestion path is a local Node script that reads JSONL chunks, normalizes metadata, and writes records into Convex.

The app keeps AI generation optional. If Ollama Cloud credentials are missing, the app still returns ranked source excerpts. This allows the app to demo search behavior without consuming cloud model usage.

## Data Model

`sources` represent a document, policy page, or SOP. They include title, category, source URL/reference, knowledge type, file type, content hash, and imported timestamp.

`chunks` represent searchable text blocks. They include source linkage, title, category, text, source URL/reference, page metadata, chunk index, and import batch ID.

`queryLogs` capture public-safe usage metadata: question, result count, whether AI was used, warnings, and timestamp.

`feedback` captures optional thumbs-up/down and comments for future quality review.

## Search Behavior

Search should prefer Convex full-text search against chunk text, title, and category. Results are grouped into answer context and citations. Low or empty evidence returns a clear "not enough evidence" message rather than hallucinating.

## Ollama Cloud Behavior

The app uses Ollama's chat API shape. The model and host are configurable:

- `OLLAMA_HOST`, default `https://ollama.com`
- `OLLAMA_MODEL`, default `gpt-oss:120b`
- `OLLAMA_API_KEY`, required for cloud answer synthesis

The app must never expose the API key to the browser.

## UI

The first screen is the actual search tool, not a marketing landing page. It should be fast, calm, and work-focused: a large search input, compact source filters, answer panel, citation list, and source excerpts. It should support desktop and mobile without overlapping or clipped text.

## Testing

Core tests cover:

- chunk normalization from existing JSONL records
- source ID stability
- search result shaping
- fallback answer behavior when AI is unavailable
- UI rendering of answers, citations, warnings, and empty states

## Deployment

V1 deploys to Vercel and Convex free tiers with public-safe content. The deployment guide must list required environment variables and one clear import command.

## Known Risks

- Free tier limits can be exceeded with large documents or heavy usage.
- Ollama Cloud free usage is limited and may vary over time.
- V1 has no auth; only public-safe documents should be imported.
- Convex full-text search is adequate for POC but may need embeddings/vector search later.
- Clerk production domain allowlist may require paid features; V2 should enforce domains in app logic even if Clerk settings help.
