import { ConvexHttpClient } from "convex/browser";

import {
  buildIcbcCheckResult,
  ICBC_NAV_XML_URL,
  parseIcbcNavEntries,
  type IcbcCheckResult,
} from "@/lib/admin/icbcMaintenance";
import { adminAccessErrorResponse, requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { convexFunctions } from "@/lib/convexReferences";

export const runtime = "nodejs";
export const maxDuration = 60;

export type IcbcCheckApiResponse = IcbcCheckResult & {
  logStored: boolean;
  logWarning?: string;
};

export async function GET() {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return adminAccessErrorResponse(access);
  }

  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return Response.json({ error: "Convex URL is not configured." }, { status: 500 });
  }

  const client = new ConvexHttpClient(convexUrl);
  const navResponse = await fetch(ICBC_NAV_XML_URL, {
    cache: "no-store",
    headers: {
      "User-Agent": "Terminal Auto Body Knowledge Base Maintenance",
    },
  });

  if (!navResponse.ok) {
    return Response.json(
      { error: `ICBC navigation map request failed: ${navResponse.status} ${navResponse.statusText}` },
      { status: 502 },
    );
  }

  const latestEntries = parseIcbcNavEntries(await navResponse.text());
  if (!latestEntries.length) {
    return Response.json({ error: "ICBC navigation map did not contain any topic references." }, { status: 502 });
  }

  const currentSources = await client.query(convexFunctions.icbcSourceSnapshot, {});
  const result = buildIcbcCheckResult(latestEntries, currentSources);
  const { logStored, logWarning } = await recordIcbcCheck(client, result, access.email);

  const body: IcbcCheckApiResponse = {
    ...result,
    logStored,
    ...(logWarning ? { logWarning } : {}),
  };

  return Response.json(body);
}

async function recordIcbcCheck(client: ConvexHttpClient, result: IcbcCheckResult, email: string) {
  const importSecret = process.env.KNOWLEDGE_IMPORT_SECRET;
  if (!importSecret) {
    return {
      logStored: false,
      logWarning: "KNOWLEDGE_IMPORT_SECRET is not configured in Vercel, so the check was not logged.",
    };
  }

  try {
    await client.mutation(convexFunctions.recordMaintenanceRun, {
      importSecret,
      jobType: "icbc_check",
      status: "succeeded",
      summary: result.summary,
      detailJson: JSON.stringify({
        status: result.status,
        counts: {
          latest: result.comparison.totalLatest,
          current: result.comparison.totalCurrent,
          unchanged: result.comparison.unchangedCount,
          missing: result.comparison.missingFromKnowledgeBase.length,
          stale: result.comparison.staleInKnowledgeBase.length,
          titleChanges: result.comparison.titleChanges.length,
        },
        missingSample: result.comparison.missingFromKnowledgeBase.slice(0, 20),
        staleSample: result.comparison.staleInKnowledgeBase.slice(0, 20),
        titleChangeSample: result.comparison.titleChanges.slice(0, 20),
      }),
      createdByEmail: email,
    });

    return { logStored: true };
  } catch (error) {
    return {
      logStored: false,
      logWarning: error instanceof Error ? error.message : "ICBC check completed but logging failed.",
    };
  }
}
