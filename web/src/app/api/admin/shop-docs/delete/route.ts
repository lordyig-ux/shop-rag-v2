import { ConvexHttpClient } from "convex/browser";

import { adminAccessErrorResponse, requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { convexFunctions } from "@/lib/convexReferences";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return adminAccessErrorResponse(access);
  }

  const body = (await request.json()) as { sourceRef?: unknown };
  const sourceRef = typeof body.sourceRef === "string" ? body.sourceRef.trim() : "";
  if (!sourceRef) {
    return Response.json({ error: "Source ref is required." }, { status: 400 });
  }

  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  const importSecret = process.env.KNOWLEDGE_IMPORT_SECRET;
  if (!convexUrl) {
    return Response.json({ error: "Convex URL is not configured." }, { status: 500 });
  }
  if (!importSecret) {
    return Response.json({ error: "KNOWLEDGE_IMPORT_SECRET is not configured in Vercel." }, { status: 500 });
  }

  const client = new ConvexHttpClient(convexUrl);
  let chunksDeleted = 0;
  let sourcesDeleted = 0;
  let hasMore = true;
  let iterations = 0;

  while (hasMore && iterations < 50) {
    const result = await client.mutation(convexFunctions.deleteSourcesBySourceRefPage, {
      importSecret,
      sourceRef,
      limit: 200,
    });
    chunksDeleted += result.chunksDeleted;
    sourcesDeleted += result.sourcesDeleted;
    hasMore = result.hasMore;
    iterations += 1;
  }

  return Response.json({
    sourceRef,
    chunksDeleted,
    sourcesDeleted,
    summary: `Deleted ${sourcesDeleted} source(s) and ${chunksDeleted} chunk(s).`,
  });
}
