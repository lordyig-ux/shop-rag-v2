import { ConvexHttpClient } from "convex/browser";

import { rebuildAdminOverviewSummaries } from "@/lib/admin/rebuildOverviewSummaries";
import { adminAccessErrorResponse, requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { convexFunctions } from "@/lib/convexReferences";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{ batchId: string }>;
  },
) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return adminAccessErrorResponse(access);
  }

  const { batchId } = await context.params;
  const normalizedBatchId = decodeURIComponent(batchId || "").trim();
  if (!normalizedBatchId) {
    return Response.json({ error: "Batch ID is required." }, { status: 400 });
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
    const result = await client.mutation(convexFunctions.deleteImportedBatchPage, {
      importSecret,
      batchId: normalizedBatchId,
      limit: 200,
    });
    chunksDeleted += result.chunksDeleted;
    sourcesDeleted += result.sourcesDeleted;
    hasMore = result.hasMore;
    iterations += 1;
  }
  await rebuildAdminOverviewSummaries(client, importSecret);

  return Response.json({
    batch: normalizedBatchId,
    chunksDeleted,
    sourcesDeleted,
    hasMore,
  });
}
