import { ConvexHttpClient } from "convex/browser";

import {
  buildIcbcCheckResult,
  ICBC_MAPS,
  icbcNavXmlUrl,
  parseIcbcNavEntries,
  verifyIcbcNotListedSources,
  type IcbcCheckResult,
  type IcbcNavEntry,
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
  let latestEntries: IcbcNavEntry[];
  try {
    latestEntries = await fetchIcbcNavEntries();
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "ICBC navigation map request failed." },
      { status: 502 },
    );
  }

  const currentSources = await client.query(convexFunctions.icbcSourceSnapshot, {});
  const uncheckedResult = buildIcbcCheckResult(latestEntries, currentSources);
  const verifiedNotListed = await verifyIcbcNotListedSources(uncheckedResult.comparison.notListedInNav);
  const result = buildIcbcCheckResult(latestEntries, currentSources, Date.now(), verifiedNotListed);
  const { logStored, logWarning } = await recordIcbcCheck(client, result, access.email);

  const body: IcbcCheckApiResponse = {
    ...result,
    logStored,
    ...(logWarning ? { logWarning } : {}),
  };

  return Response.json(body);
}

async function fetchIcbcNavEntries() {
  const entriesByTopicId = new Map<string, IcbcNavEntry>();

  for (const map of ICBC_MAPS) {
    const navResponse = await fetch(icbcNavXmlUrl(map.mapName), {
      cache: "no-store",
      headers: {
        "User-Agent": "Terminal Auto Body Knowledge Base Maintenance",
      },
    });

    if (!navResponse.ok) {
      throw new Error(`ICBC navigation map request failed: ${navResponse.status} ${navResponse.statusText}`);
    }

    for (const entry of parseIcbcNavEntries(await navResponse.text(), map.mapName)) {
      if (!entriesByTopicId.has(entry.topicId.toLowerCase())) {
        entriesByTopicId.set(entry.topicId.toLowerCase(), entry);
      }
    }
  }

  const entries = Array.from(entriesByTopicId.values());
  if (!entries.length) {
    throw new Error("ICBC navigation maps did not contain any topic references.");
  }
  return entries;
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
          notListedInNav: result.comparison.notListedInNav.length,
          liveNotListedInNav: result.comparison.notListedInNav.filter((source) => source.directUrlStatus === "live")
            .length,
          confirmedNotFound: result.comparison.notListedInNav.filter((source) => source.directUrlStatus === "not_found")
            .length,
          directCheckFailed: result.comparison.notListedInNav.filter((source) => source.directUrlStatus === "check_failed")
            .length,
          titleChanges: result.comparison.titleChanges.length,
        },
        missingSample: result.comparison.missingFromKnowledgeBase.slice(0, 20),
        notListedSample: result.comparison.notListedInNav.slice(0, 20),
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
