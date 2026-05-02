# Terminal Auto Body Knowledge Base

Public-safe V1 proof of concept for searching Terminal Auto Body SOP and insurance-policy knowledge from a hosted Next.js app.

## Stack

- Next.js App Router
- Tailwind CSS
- Convex
- Optional Ollama Cloud answer synthesis
- Vitest and Testing Library

## Local Setup

```powershell
npm install
copy .env.example .env.local
npm run dev
```

The app renders a safe setup state until `NEXT_PUBLIC_CONVEX_URL` is configured.

## Environment Variables

```env
NEXT_PUBLIC_CONVEX_URL=
CONVEX_URL=
KNOWLEDGE_IMPORT_SECRET=
OLLAMA_API_KEY=
OLLAMA_HOST=https://ollama.com
OLLAMA_MODEL=gpt-oss:120b
```

`OLLAMA_API_KEY` must stay server-side. Do not prefix it with `NEXT_PUBLIC_`.
`KNOWLEDGE_IMPORT_SECRET` is only needed when importing chunks into a Convex deployment that has the same secret configured.

## Convex

Create/connect a Convex deployment:

```powershell
npx convex dev
```

Then copy the generated Convex URL into `.env.local` as `NEXT_PUBLIC_CONVEX_URL`.

## Import Public-Safe Chunks

Always dry-run first:

```powershell
npm run import:chunks -- --file ../output/chunks.jsonl --batch public-safe-v1 --dry-run
```

Import after the dry-run looks right:

```powershell
$env:CONVEX_URL=$env:NEXT_PUBLIC_CONVEX_URL
$env:KNOWLEDGE_IMPORT_SECRET="use-the-same-secret-configured-in-convex"
npm run import:chunks -- --file ../output/chunks.jsonl --batch public-safe-v1
```

V1 must only import public-safe documents because authentication is intentionally deferred.

## Verification

```powershell
npm test
npm run lint
npm run build
```

## Deployment

Deploy the `web/` directory to Vercel. Configure:

- `CONVEX_DEPLOY_KEY`
- `OLLAMA_API_KEY`
- `OLLAMA_HOST`
- `OLLAMA_MODEL`

Use this Vercel build command so Convex deploys production functions and provides the production URL to Next.js:

```bash
npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd "npm run build"
```

Configure `KNOWLEDGE_IMPORT_SECRET` in the Convex production deployment, not Vercel, before importing production chunks.

The Ollama defaults target the direct Ollama Cloud API model name `gpt-oss:120b`. If you run through a local Ollama app instead, use the cloud tag appropriate to that host, such as `gpt-oss:120b-cloud`.
