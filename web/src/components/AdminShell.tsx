"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { AdminAiHealth, AdminOverview, AdminSignal } from "@/lib/admin/contracts";
import { deriveAdminSignals } from "@/lib/admin/adminStatus";
import type { IcbcCheckResult } from "@/lib/admin/icbcMaintenance";
import { convexFunctions } from "@/lib/convexReferences";
import type { KnowledgeType } from "@/lib/knowledge/normalizeChunk";

const typeLabels: Record<keyof AdminOverview["chunksByKnowledgeType"], string> = {
  sop: "SOPs",
  insurance_policy: "Insurance policy",
  shop_doc: "Shop docs",
  reference: "Reference",
};

type ToolTab = "icbc" | "shop_docs" | "mitchell_ceg";
type IcbcCheckUiResult = IcbcCheckResult & {
  logStored?: boolean;
  logWarning?: string;
};

export function AdminShell() {
  const overview = useQuery(convexFunctions.adminOverview, {});
  const [aiHealth, setAiHealth] = useState<AdminAiHealth | null>(null);
  const [aiError, setAiError] = useState("");
  const [activeTool, setActiveTool] = useState<ToolTab>("icbc");
  const [icbcBusy, setIcbcBusy] = useState(false);
  const [icbcError, setIcbcError] = useState("");
  const [icbcResult, setIcbcResult] = useState<IcbcCheckUiResult | null>(null);
  const [batchId, setBatchId] = useState(defaultBatchId());
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType>("insurance_policy");
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState("");
  const [maintenanceResult, setMaintenanceResult] = useState<Record<string, unknown> | null>(null);
  const [deletingBatch, setDeletingBatch] = useState("");

  useEffect(() => {
    let active = true;

    fetch("/api/admin/ai-health")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return (await response.json()) as AdminAiHealth;
      })
      .then((health) => {
        if (active) {
          setAiHealth(health);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setAiError(error instanceof Error ? error.message : "AI health check failed");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const signals = useMemo(() => deriveAdminSignals(overview, aiHealth), [overview, aiHealth]);
  const latestIcbcRun = overview?.maintenanceRuns.find((run) => run.jobType === "icbc_check") || null;

  async function loadImportFile(file: File | undefined) {
    setMaintenanceError("");
    setMaintenanceResult(null);
    if (!file) {
      setFileName("");
      setFileContent("");
      return;
    }

    setFileName(file.name);
    setFileContent(await file.text());
  }

  async function runImport(dryRun: boolean) {
    setMaintenanceBusy(true);
    setMaintenanceError("");
    setMaintenanceResult(null);

    try {
      const response = await fetch("/api/admin/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: fileContent,
          batch: batchId,
          knowledgeType,
          dryRun,
        }),
      });
      const body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Import failed");
      }
      setMaintenanceResult(body);
    } catch (error) {
      setMaintenanceError(error instanceof Error ? error.message : "Import failed");
    } finally {
      setMaintenanceBusy(false);
    }
  }

  async function runIcbcCheck() {
    setIcbcBusy(true);
    setIcbcError("");
    setIcbcResult(null);

    try {
      const response = await fetch("/api/admin/icbc/check", { method: "GET" });
      const body = (await response.json()) as IcbcCheckUiResult | { error?: string };
      if (!response.ok) {
        throw new Error("error" in body && body.error ? body.error : "ICBC update check failed");
      }
      setIcbcResult(body as IcbcCheckUiResult);
    } catch (error) {
      setIcbcError(error instanceof Error ? error.message : "ICBC update check failed");
    } finally {
      setIcbcBusy(false);
    }
  }

  async function deleteBatch(targetBatchId: string) {
    if (!window.confirm(`Delete all chunks and sources in batch "${targetBatchId}"?`)) {
      return;
    }

    setDeletingBatch(targetBatchId);
    setMaintenanceError("");
    setMaintenanceResult(null);

    try {
      const response = await fetch(`/api/admin/batches/${encodeURIComponent(targetBatchId)}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Delete failed");
      }
      setMaintenanceResult(body);
    } catch (error) {
      setMaintenanceError(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeletingBatch("");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Terminal Auto Body</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">Admin Dashboard</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Production maintenance for the public-safe knowledge base.
            </p>
          </div>
          <Link
            className="inline-flex w-fit rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-emerald-600 hover:text-slate-950"
            href="/"
          >
            Back to search
          </Link>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          {signals.map((signal) => (
            <SignalCard key={signal.label} signal={signal} />
          ))}
        </section>

        {!overview ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            Loading production database status...
          </div>
        ) : (
          <>
            <Panel title="Knowledge Base Tools">
              <div className="flex flex-wrap gap-2">
                <ToolTabButton active={activeTool === "icbc"} onClick={() => setActiveTool("icbc")}>
                  ICBC
                </ToolTabButton>
                <ToolTabButton active={activeTool === "shop_docs"} onClick={() => setActiveTool("shop_docs")}>
                  Shop Docs
                </ToolTabButton>
                <ToolTabButton active={activeTool === "mitchell_ceg"} onClick={() => setActiveTool("mitchell_ceg")}>
                  Mitchell CEG
                </ToolTabButton>
              </div>

              {activeTool === "icbc" ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">ICBC Maintenance</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Compare the ICBC navigation map with the sources currently stored in Convex.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                        disabled={icbcBusy}
                        type="button"
                        onClick={() => void runIcbcCheck()}
                      >
                        {icbcBusy ? "Checking..." : "Check ICBC Updates"}
                      </button>
                      <button
                        className="rounded-md border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500"
                        disabled
                        type="button"
                      >
                        Run Full ICBC Refresh
                      </button>
                    </div>

                    <div className="space-y-1 text-sm text-slate-600">
                      <div>
                        Live collection: <span className="font-semibold text-slate-950">{overview.batches[0]?.batchId || "No batch"}</span>
                      </div>
                      <div>
                        Last checked:{" "}
                        <span className="font-semibold text-slate-950">
                          {latestIcbcRun ? formatDate(latestIcbcRun.createdAt) : "Not checked from this admin yet"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <IcbcCheckResultPanel result={icbcResult} error={icbcError} latestRun={latestIcbcRun} />
                </div>
              ) : null}

              {activeTool === "shop_docs" ? (
                <div className="mt-5 space-y-4">
                  <h3 className="text-base font-semibold text-slate-950">Shop Docs Ingestion</h3>
                  <p className="max-w-3xl text-sm leading-6 text-slate-600">
                    The hosted version will use a secure upload inbox instead of reading a Windows folder directly.
                    Use the manual JSONL import below until the file inbox is added.
                  </p>
                  <button
                    className="rounded-md border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500"
                    disabled
                    type="button"
                  >
                    Import Shop Docs
                  </button>
                </div>
              ) : null}

              {activeTool === "mitchell_ceg" ? (
                <div className="mt-5 space-y-4">
                  <h3 className="text-base font-semibold text-slate-950">Mitchell CEG Maintenance</h3>
                  <p className="max-w-3xl text-sm leading-6 text-slate-600">
                    The hosted crawler will refresh the Mitchell CEG public pages and import them as shop docs in the
                    next maintenance slice.
                  </p>
                  <button
                    className="rounded-md border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500"
                    disabled
                    type="button"
                  >
                    Refresh Mitchell CEG
                  </button>
                </div>
              ) : null}
            </Panel>

            <Panel title="Manual JSONL Import">
              <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-slate-700" htmlFor="jsonl-upload">
                    JSONL file
                  </label>
                  <input
                    id="jsonl-upload"
                    className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                    type="file"
                    accept=".jsonl,application/json,text/plain"
                    onChange={(event) => void loadImportFile(event.target.files?.[0])}
                  />
                  {fileName ? <div className="text-sm text-slate-500">{fileName}</div> : null}

                  <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                    <label className="block text-sm font-medium text-slate-700" htmlFor="batch-id">
                      Batch ID
                      <input
                        id="batch-id"
                        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                        value={batchId}
                        onChange={(event) => setBatchId(event.target.value)}
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700" htmlFor="knowledge-type">
                      Type
                      <select
                        id="knowledge-type"
                        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                        value={knowledgeType}
                        onChange={(event) => setKnowledgeType(event.target.value as KnowledgeType)}
                      >
                        <option value="insurance_policy">Insurance policy</option>
                        <option value="sop">SOP</option>
                        <option value="shop_doc">Shop doc</option>
                        <option value="reference">Reference</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={maintenanceBusy || !fileContent}
                      type="button"
                      onClick={() => void runImport(true)}
                    >
                      Dry Run
                    </button>
                    <button
                      className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={maintenanceBusy || !fileContent}
                      type="button"
                      onClick={() => void runImport(false)}
                    >
                      {maintenanceBusy ? "Working..." : "Import"}
                    </button>
                  </div>
                </div>

                <div>
                  {maintenanceError ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{maintenanceError}</div>
                  ) : maintenanceResult ? (
                    <pre className="max-h-80 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-white">
                      {JSON.stringify(maintenanceResult, null, 2)}
                    </pre>
                  ) : (
                    <EmptyMessage>Maintenance results will appear here.</EmptyMessage>
                  )}
                </div>
              </div>
            </Panel>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Sources" value={overview.sourceCount} />
              <Metric label="Chunks" value={overview.chunkCount} />
              <Metric label="Recent logged queries" value={overview.queryCount} />
              <Metric label="Latest import" value={overview.latestImportAt ? formatDate(overview.latestImportAt) : "None"} />
            </section>

            <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <Panel title="Knowledge Mix">
                <div className="space-y-3">
                  {(Object.keys(typeLabels) as Array<keyof AdminOverview["chunksByKnowledgeType"]>).map((type) => (
                    <div key={type} className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm">
                      <span className="font-medium text-slate-700">{typeLabels[type]}</span>
                      <span className="text-slate-500">{overview.sourcesByKnowledgeType[type]} sources</span>
                      <span className="font-semibold text-slate-950">{overview.chunksByKnowledgeType[type]} chunks</span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Import Batches">
                {overview.batches.length ? (
                  <div className="space-y-3">
                    {overview.batches.map((batch) => (
                      <div key={batch.batchId} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-950">{batch.batchId}</div>
                            <div className="mt-1 text-slate-600">
                              {batch.sources} sources, {batch.chunks} chunks, imported {formatDate(batch.importedAt)}
                            </div>
                          </div>
                          <button
                            className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={Boolean(deletingBatch)}
                            type="button"
                            onClick={() => void deleteBatch(batch.batchId)}
                          >
                            {deletingBatch === batch.batchId ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyMessage>No import batches found.</EmptyMessage>
                )}
              </Panel>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Panel title="Recent Searches">
                {overview.recentQueries.length ? (
                  <div className="space-y-3">
                    {overview.recentQueries.map((query) => (
                      <div key={`${query.createdAt}-${query.question}`} className="rounded-md border border-slate-200 p-3 text-sm">
                        <div className="font-medium text-slate-950">{query.question}</div>
                        <div className="mt-1 text-slate-600">
                          {formatDate(query.createdAt)} - {query.resultCount} results - {query.usedAi ? "AI used" : "Fallback"}
                        </div>
                        {query.warnings.length ? <div className="mt-1 text-amber-700">{query.warnings.join(", ")}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyMessage>No searches logged yet.</EmptyMessage>
                )}
              </Panel>

              <Panel title="Source Samples">
                {overview.sourceSamples.length ? (
                  <div className="space-y-3">
                    {overview.sourceSamples.map((source) => (
                      <div key={`${source.importedBatchId}-${source.title}-${source.category}`} className="text-sm">
                        <div className="font-medium text-slate-950">{source.title}</div>
                        <div className="mt-1 text-slate-600">{source.category}</div>
                        {source.sourceUrl ? (
                          <a className="mt-1 inline-block text-emerald-700 hover:text-emerald-900" href={source.sourceUrl}>
                            Open source
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyMessage>No source samples found.</EmptyMessage>
                )}
              </Panel>
            </section>
          </>
        )}

        <Panel title="AI Health">
          {aiHealth ? (
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Configured" value={aiHealth.configured ? "Yes" : "No"} />
              <Metric label="Model" value={aiHealth.model} />
              <Metric label="Host" value={aiHealth.host} />
              <Metric label="Checked" value={formatDate(aiHealth.checkedAt)} />
            </div>
          ) : (
            <EmptyMessage>{aiError || "Checking Ollama health..."}</EmptyMessage>
          )}
        </Panel>
      </section>
    </main>
  );
}

function IcbcCheckResultPanel({
  error,
  latestRun,
  result,
}: {
  error: string;
  latestRun: AdminOverview["maintenanceRuns"][number] | null;
  result: IcbcCheckUiResult | null;
}) {
  if (error) {
    return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>;
  }

  if (!result) {
    return latestRun ? (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="font-semibold text-slate-950">Latest ICBC check</div>
        <div className="mt-1 text-slate-600">{latestRun.summary}</div>
        <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {latestRun.status} - {formatDate(latestRun.createdAt)}
        </div>
      </div>
    ) : (
      <EmptyMessage>ICBC check results will appear here.</EmptyMessage>
    );
  }

  const comparison = result.comparison;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide ${
              result.status === "up_to_date" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {result.status === "up_to_date" ? "Up to date" : "Updates found"}
          </span>
          <span className="text-sm text-slate-500">{formatDate(result.checkedAt)}</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-700">{result.summary}</p>
        {result.logWarning ? <p className="mt-2 text-sm text-amber-700">{result.logWarning}</p> : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <CompactMetric label="ICBC topics" value={comparison.totalLatest} />
        <CompactMetric label="Current sources" value={comparison.totalCurrent} />
        <CompactMetric label="Matched" value={comparison.unchangedCount} />
        <CompactMetric label="New topics" value={comparison.missingFromKnowledgeBase.length} />
        <CompactMetric label="Stale sources" value={comparison.staleInKnowledgeBase.length} />
        <CompactMetric label="Title changes" value={comparison.titleChanges.length} />
      </div>

      {comparison.missingFromKnowledgeBase.length ? (
        <ResultList title="New ICBC topics">
          {comparison.missingFromKnowledgeBase.slice(0, 8).map((entry) => (
            <li key={entry.topicId}>
              <a className="font-medium text-emerald-700 hover:text-emerald-900" href={entry.sourceUrl}>
                {entry.title}
              </a>
            </li>
          ))}
        </ResultList>
      ) : null}

      {comparison.staleInKnowledgeBase.length ? (
        <ResultList title="Sources no longer in the ICBC nav">
          {comparison.staleInKnowledgeBase.slice(0, 8).map((source) => (
            <li key={`${source.importedBatchId}-${source.sourceRef}`}>{source.title}</li>
          ))}
        </ResultList>
      ) : null}
    </div>
  );
}

function ToolTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`rounded-md border px-4 py-2 text-sm font-semibold ${
        active
          ? "border-red-600 bg-red-600 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:border-red-500 hover:text-slate-950"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SignalCard({ signal }: { signal: AdminSignal }) {
  const toneClass =
    signal.tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : signal.tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-white text-slate-800";

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="text-sm font-semibold">{signal.label}</div>
      <div className="mt-1 text-sm">{signal.message}</div>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value.toLocaleString()}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-950">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}

function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">{children}</div>;
}

function ResultList({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 text-sm">
      <div className="font-semibold text-slate-950">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">{children}</ul>
    </div>
  );
}

function defaultBatchId() {
  return `public-safe-${new Date().toISOString().slice(0, 10)}`;
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
