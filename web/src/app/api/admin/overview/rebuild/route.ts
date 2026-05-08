import { ConvexHttpClient } from "convex/browser";

import { rebuildAdminOverviewSummaries } from "@/lib/admin/rebuildOverviewSummaries";
import { adminAccessErrorResponse, requireAdminAccess } from "@/lib/auth/requireAdminAccess";

export async function POST() {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return adminAccessErrorResponse(access);
  }

  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  const importSecret = process.env.KNOWLEDGE_IMPORT_SECRET;
  if (!convexUrl) {
    return Response.json({ error: "Convex environment variables are not configured" }, { status: 500 });
  }

  const client = new ConvexHttpClient(convexUrl);
  const result = await rebuildAdminOverviewSummaries(client, importSecret);

  return Response.json(result);
}
