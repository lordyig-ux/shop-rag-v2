"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { AdminAiHealth, AdminOverview, AdminSignal } from "@/lib/admin/contracts";
import { deriveAdminSignals } from "@/lib/admin/adminStatus";
import { convexFunctions } from "@/lib/convexReferences";

const typeLabels: Record<keyof AdminOverview["chunksByKnowledgeType"], string> = {
  sop: "SOPs",
  insurance_policy: "Insurance policy",
  shop_doc: "Shop docs",
  reference: "Reference",
};

export function AdminShell() {
  const overview = useQuery(convexFunctions.adminOverview, {});
  const [aiHealth, setAiHealth] = useState<AdminAiHealth | null>(null);
  const [aiError, setAiError] = useState("");

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

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Terminal Auto Body</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">Admin Status</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Read-only production checks for the public-safe knowledge base.
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
                        <div className="font-semibold text-slate-950">{batch.batchId}</div>
                        <div className="mt-1 text-slate-600">
                          {batch.sources} sources, {batch.chunks} chunks, imported {formatDate(batch.importedAt)}
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
                          {formatDate(query.createdAt)} · {query.resultCount} results · {query.usedAi ? "AI used" : "Fallback"}
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

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
