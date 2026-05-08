import { ConvexHttpClient } from "convex/browser";

import { adminAccessErrorResponse, requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { convexFunctions } from "@/lib/convexReferences";

export async function GET() {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return adminAccessErrorResponse(access);
  }

  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  const importSecret = process.env.KNOWLEDGE_IMPORT_SECRET;
  if (!convexUrl) {
    return Response.json({ error: "Convex analytics environment variables are not configured" }, { status: 500 });
  }

  const client = new ConvexHttpClient(convexUrl);
  const args: { importSecret?: string; limit: number } = {
    limit: 500,
  };
  if (importSecret) {
    args.importSecret = importSecret;
  }

  const analytics = await client.query(convexFunctions.adminUsageAnalytics, args);

  return Response.json(analytics);
}
