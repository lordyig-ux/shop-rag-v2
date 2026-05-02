import type { AdminAiHealth, AdminOverview, AdminSignal } from "./contracts";

export function deriveAdminSignals(overview?: AdminOverview, aiHealth?: AdminAiHealth | null): AdminSignal[] {
  const databaseSignal: AdminSignal =
    overview && overview.chunkCount > 0
      ? {
          label: "Database",
          tone: "good",
          message: `${overview.chunkCount.toLocaleString()} chunks across ${overview.sourceCount.toLocaleString()} sources`,
        }
      : {
          label: "Database",
          tone: "warn",
          message: "No chunks imported",
        };

  const aiSignal: AdminSignal =
    aiHealth && aiHealth.ok
      ? {
          label: "AI",
          tone: "good",
          message: `Ollama answered using ${aiHealth.model}`,
        }
      : {
          label: "AI",
          tone: "warn",
          message: aiHealth?.warnings[0] || "AI health not checked",
        };

  return [databaseSignal, aiSignal];
}
