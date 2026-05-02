# Terminal KB Web V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable Next.js + Convex proof-of-concept knowledge-base web app using public-safe docs and optional Ollama Cloud answer synthesis.

**Architecture:** Create a new `web/` app beside the existing Python implementation. Convex stores sources/chunks/query logs; Next.js renders the staff search UI and calls Convex queries/actions. A local import script converts existing JSONL chunks into Convex records.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Convex, Vitest, Testing Library, Ollama Cloud API.

---

### Task 1: Project Scaffold And Repo Hygiene

**Files:**
- Create: `.gitignore`
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/next.config.ts`
- Create: `web/postcss.config.mjs`
- Create: `web/app/layout.tsx`
- Create: `web/app/page.tsx`
- Create: `web/app/globals.css`
- Create: `web/README.md`

- [ ] Initialize git if no repository exists: `git init`.
- [ ] Scaffold a Next.js app under `web/` using TypeScript, App Router, and Tailwind.
- [ ] Keep generated files minimal and remove starter marketing UI.
- [ ] Run `npm install` from `web/`.
- [ ] Run `npm run lint` or the available equivalent.

### Task 2: Convex Schema And Normalization Tests

**Files:**
- Create: `web/convex/schema.ts`
- Create: `web/src/lib/knowledge/normalizeChunk.ts`
- Create: `web/src/lib/knowledge/normalizeChunk.test.ts`
- Modify: `web/package.json`

- [ ] Add Vitest test tooling.
- [ ] Write a failing test that normalizes an ICBC-style `chunks.jsonl` record into a stable source and chunk shape.
- [ ] Implement `normalizeChunkRecord`.
- [ ] Define Convex tables for `sources`, `chunks`, `queryLogs`, and `feedback`.
- [ ] Run the normalization test and confirm it passes.

### Task 3: Import Script

**Files:**
- Create: `web/scripts/importChunks.ts`
- Modify: `web/package.json`

- [ ] Write a failing test or dry-run path for JSONL parsing and normalization.
- [ ] Implement `npm run import:chunks -- --file ../output/chunks.jsonl --batch public-safe-v1 --dry-run`.
- [ ] Add a non-dry-run path that calls Convex mutations.
- [ ] Ensure import skips blank/malformed records with clear warnings.

### Task 4: Search Backend

**Files:**
- Create: `web/convex/knowledge.ts`
- Create: `web/src/lib/search/contracts.ts`
- Create: `web/src/lib/search/shapeResults.ts`
- Create: `web/src/lib/search/shapeResults.test.ts`

- [ ] Write failing tests for empty search, citation shaping, and low-evidence fallback.
- [ ] Add Convex search query over chunks.
- [ ] Add Convex mutation for query logs.
- [ ] Implement result shaping for answer context and citations.
- [ ] Run backend/unit tests.

### Task 5: Ollama Cloud Answer Route

**Files:**
- Create: `web/app/api/answer/route.ts`
- Create: `web/src/lib/ai/ollama.ts`
- Create: `web/src/lib/ai/ollama.test.ts`

- [ ] Write failing tests for missing `OLLAMA_API_KEY`, successful response parsing, and API error fallback.
- [ ] Implement server-only Ollama client with configurable `OLLAMA_HOST` and `OLLAMA_MODEL`.
- [ ] Make the API route return extractive fallback when AI is disabled.
- [ ] Ensure secrets never appear in client code.

### Task 6: Staff Search UI

**Files:**
- Modify: `web/app/page.tsx`
- Create: `web/src/components/SearchShell.tsx`
- Create: `web/src/components/AnswerPanel.tsx`
- Create: `web/src/components/CitationList.tsx`
- Create: `web/src/components/SourceFilter.tsx`
- Create: `web/src/components/SearchShell.test.tsx`

- [ ] Write failing UI tests for answer rendering, empty state, citation rendering, and warnings.
- [ ] Build the first-screen search tool with Tailwind.
- [ ] Add source filter controls for all docs, SOPs, and insurance/policy docs.
- [ ] Wire the form to Convex search and optional `/api/answer`.
- [ ] Verify responsive layout manually.

### Task 7: Deployment Documentation

**Files:**
- Modify: `web/README.md`
- Create: `web/.env.example`

- [ ] Document local setup.
- [ ] Document Convex dev and deploy commands.
- [ ] Document Vercel env vars.
- [ ] Document public-safe V1 content rule.
- [ ] Document Ollama Cloud defaults and limits.

### Task 8: Verification

**Files:**
- No new files unless fixing discovered issues.

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Start the local dev server.
- [ ] Manually verify the search UI loads on desktop and mobile viewport.
- [ ] Report exact commands and outcomes.
