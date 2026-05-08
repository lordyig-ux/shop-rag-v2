import type { ConvexHttpClient } from "convex/browser";

import { convexFunctions } from "@/lib/convexReferences";

export async function rebuildAdminOverviewSummaries(client: ConvexHttpClient, importSecret?: string) {
  const args: { importSecret?: string } = {};
  if (importSecret) {
    args.importSecret = importSecret;
  }

  return client.mutation(convexFunctions.rebuildAdminOverviewSummaries, args);
}
