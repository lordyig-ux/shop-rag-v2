import { ConvexHttpClient } from "convex/browser";

import { parseMaintenanceImportRequest } from "@/lib/admin/maintenanceImport";
import { rebuildAdminOverviewSummaries } from "@/lib/admin/rebuildOverviewSummaries";
import { adminAccessErrorResponse, requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { convexFunctions } from "@/lib/convexReferences";
import { parseChunkJsonl } from "@/lib/knowledge/jsonlImport";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return adminAccessErrorResponse(access);
  }

  const parsedRequest = parseMaintenanceImportRequest(await request.json());
  if (!parsedRequest.ok) {
    return Response.json({ error: parsedRequest.error }, { status: 400 });
  }

  const { batchId, content, dryRun, knowledgeType } = parsedRequest.value;
  const parsed = parseChunkJsonl(content, {
    batchId,
    defaultKnowledgeType: knowledgeType,
  });
  const sourceCount = new Set(parsed.records.map((record) => record.source.sourceId)).size;

  if (dryRun) {
    return Response.json({
      mode: "dry-run",
      batch: batchId,
      knowledgeType,
      sources: sourceCount,
      chunks: parsed.records.length,
      skipped: parsed.skipped,
    });
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
  let chunksUpserted = 0;
  let sourcesUpserted = 0;

  for (const records of chunk(parsed.records, 200)) {
    const result = await client.mutation(convexFunctions.upsertImportedChunks, {
      importSecret,
      records,
    });
    chunksUpserted += result.chunksUpserted;
    sourcesUpserted += result.sourcesUpserted;
  }
  await rebuildAdminOverviewSummaries(client, importSecret);

  return Response.json({
    mode: "import",
    batch: batchId,
    knowledgeType,
    sourcesUpserted,
    chunksUpserted,
    skipped: parsed.skipped,
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
