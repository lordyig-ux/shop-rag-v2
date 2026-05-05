"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AdminAiHealth, AdminOverview, AdminShopDocument, AdminSignal } from "@/lib/admin/contracts";
import { deriveAdminSignals } from "@/lib/admin/adminStatus";
import type { IcbcCheckResult } from "@/lib/admin/icbcMaintenance";
import type { IcbcRefreshResult } from "@/lib/admin/icbcRefresh";
import { jsonResponseErrorMessage, readJsonResponse } from "@/lib/admin/jsonResponse";
import type { MitchellCegRefreshResult } from "@/lib/admin/mitchellCeg";
import { COLLISION_PROGRAM_GUIDE_URL, type ShopDocsImportResult } from "@/lib/admin/shopDocs";
import { ADMIN_BYPASS_HEADER } from "@/lib/auth/adminBypassConstants";
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
type IcbcRefreshUiResult = IcbcRefreshResult;
type ShopDocsUiResult = ShopDocsImportResult & {
  oldSourcesDeleted?: number;
  oldChunksDeleted?: number;
};
type ShopDocsActionResult = ShopDocsUiResult | Record<string, unknown>;

export function AdminShell({ adminBypassToken = "" }: { adminBypassToken?: string }) {
  const overview = useQuery(convexFunctions.adminOverview, {});
  const [aiHealth, setAiHealth] = useState<AdminAiHealth | null>(null);
  const [aiError, setAiError] = useState("");
  const [activeTool, setActiveTool] = useState<ToolTab>("icbc");
  const [icbcBusy, setIcbcBusy] = useState(false);
  const [icbcError, setIcbcError] = useState("");
  const [icbcResult, setIcbcResult] = useState<IcbcCheckUiResult | null>(null);
  const [icbcRefreshBusy, setIcbcRefreshBusy] = useState(false);
  const [icbcRefreshResult, setIcbcRefreshResult] = useState<IcbcRefreshUiResult | null>(null);
  const [shopDocsUrls, setShopDocsUrls] = useState(COLLISION_PROGRAM_GUIDE_URL);
  const [shopDocFiles, setShopDocFiles] = useState<File[]>([]);
  const [shopDocDocumentKey, setShopDocDocumentKey] = useState("");
  const [shopDocsBusy, setShopDocsBusy] = useState(false);
  const [shopDocsError, setShopDocsError] = useState("");
  const [shopDocsResult, setShopDocsResult] = useState<ShopDocsActionResult | null>(null);
  const [mitchellBusy, setMitchellBusy] = useState(false);
  const [mitchellError, setMitchellError] = useState("");
  const [mitchellResult, setMitchellResult] = useState<MitchellCegRefreshResult | null>(null);
  const [batchId, setBatchId] = useState(defaultBatchId());
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType>("insurance_policy");
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState("");
  const [maintenanceResult, setMaintenanceResult] = useState<Record<string, unknown> | null>(null);
  const [deletingBatch, setDeletingBatch] = useState("");
  const [deletingSourceRef, setDeletingSourceRef] = useState("");
  const adminFetch = useCallback(
    (input: RequestInfo | URL, init: RequestInit = {}) => fetch(input, withAdminBypassHeader(init, adminBypassToken)),
    [adminBypassToken],
  );

  useEffect(() => {
    let active = true;

    adminFetch("/api/admin/ai-health")
      .then(async (response) => {
        const health = await readJsonResponse<AdminAiHealth>(response, "AI health check failed");
        if (!response.ok) {
          throw new Error(jsonResponseErrorMessage(health, "AI health check failed"));
        }
        return health;
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
  }, [adminFetch]);

  const signals = useMemo(() => deriveAdminSignals(overview, aiHealth), [overview, aiHealth]);
  const latestIcbcCheckRun = overview?.maintenanceRuns.find((run) => run.jobType === "icbc_check") || null;
  const latestIcbcRefreshRun = overview?.maintenanceRuns.find((run) => run.jobType === "icbc_refresh") || null;
  const latestShopDocsRun = overview?.maintenanceRuns.find((run) => run.jobType === "shop_docs_import") || null;
  const latestMitchellRun = overview?.maintenanceRuns.find((run) => run.jobType === "mitchell_ceg_refresh") || null;

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
      const response = await adminFetch("/api/admin/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: fileContent,
          batch: batchId,
          knowledgeType,
          dryRun,
        }),
      });
      const body = await readJsonResponse<Record<string, unknown>>(response, "Import failed");
      if (!response.ok) {
        throw new Error(jsonResponseErrorMessage(body, "Import failed"));
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
    setIcbcRefreshResult(null);

    try {
      const response = await adminFetch("/api/admin/icbc/check", { method: "GET" });
      const body = await readJsonResponse<IcbcCheckUiResult | { error?: string }>(response, "ICBC update check failed");
      if (!response.ok) {
        throw new Error(jsonResponseErrorMessage(body, "ICBC update check failed"));
      }
      setIcbcResult(body as IcbcCheckUiResult);
    } catch (error) {
      setIcbcError(error instanceof Error ? error.message : "ICBC update check failed");
    } finally {
      setIcbcBusy(false);
    }
  }

  async function runIcbcRefresh() {
    if (
      !window.confirm(
        "Run a full ICBC refresh now? This scrapes the public ICBC procedures and replaces older ICBC entries after the new batch imports.",
      )
    ) {
      return;
    }

    setIcbcRefreshBusy(true);
    setIcbcError("");
    setIcbcResult(null);
    setIcbcRefreshResult(null);

    try {
      const response = await adminFetch("/api/admin/icbc/refresh", { method: "POST" });
      const body = await readJsonResponse<IcbcRefreshUiResult | { error?: string }>(response, "ICBC refresh failed");
      if (!response.ok) {
        throw new Error(jsonResponseErrorMessage(body, "ICBC refresh failed"));
      }
      setIcbcRefreshResult(body as IcbcRefreshUiResult);
    } catch (error) {
      setIcbcError(error instanceof Error ? error.message : "ICBC refresh failed");
    } finally {
      setIcbcRefreshBusy(false);
    }
  }

  async function runShopDocsImport() {
    setShopDocsBusy(true);
    setShopDocsError("");
    setShopDocsResult(null);

    try {
      const response = await adminFetch("/api/admin/shop-docs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: shopDocsUrls }),
      });
      const body = await readJsonResponse<ShopDocsUiResult | { error?: string }>(response, "Shop Docs import failed");
      if (!response.ok) {
        throw new Error(jsonResponseErrorMessage(body, "Shop Docs import failed"));
      }
      setShopDocsResult(body);
    } catch (error) {
      setShopDocsError(error instanceof Error ? error.message : "Shop Docs import failed");
    } finally {
      setShopDocsBusy(false);
    }
  }

  async function runShopDocsFileImport() {
    setShopDocsBusy(true);
    setShopDocsError("");
    setShopDocsResult(null);

    try {
      const formData = new FormData();
      for (const file of shopDocFiles) {
        formData.append("files", file);
      }
      if (shopDocDocumentKey.trim()) {
        formData.append("documentKey", shopDocDocumentKey.trim());
      }

      const response = await adminFetch("/api/admin/shop-docs/import", {
        method: "POST",
        body: formData,
      });
      const body = await readJsonResponse<ShopDocsUiResult | { error?: string }>(response, "Shop Docs upload failed");
      if (!response.ok) {
        throw new Error(jsonResponseErrorMessage(body, "Shop Docs upload failed"));
      }
      setShopDocsResult(body as ShopDocsUiResult);
    } catch (error) {
      setShopDocsError(error instanceof Error ? error.message : "Shop Docs upload failed");
    } finally {
      setShopDocsBusy(false);
    }
  }

  async function runMitchellRefresh() {
    setMitchellBusy(true);
    setMitchellError("");
    setMitchellResult(null);

    try {
      const response = await adminFetch("/api/admin/mitchell-ceg/refresh", { method: "POST" });
      const body = await readJsonResponse<MitchellCegRefreshResult | { error?: string }>(
        response,
        "Mitchell CEG refresh failed",
      );
      if (!response.ok) {
        throw new Error(jsonResponseErrorMessage(body, "Mitchell CEG refresh failed"));
      }
      setMitchellResult(body as MitchellCegRefreshResult);
    } catch (error) {
      setMitchellError(error instanceof Error ? error.message : "Mitchell CEG refresh failed");
    } finally {
      setMitchellBusy(false);
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
      const response = await adminFetch(`/api/admin/batches/${encodeURIComponent(targetBatchId)}`, {
        method: "DELETE",
      });
      const body = await readJsonResponse<Record<string, unknown>>(response, "Delete failed");
      if (!response.ok) {
        throw new Error(jsonResponseErrorMessage(body, "Delete failed"));
      }
      setMaintenanceResult(body);
    } catch (error) {
      setMaintenanceError(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeletingBatch("");
    }
  }

  async function deleteShopDocument(sourceRef: string, title: string) {
    if (!window.confirm(`Delete "${title}" from Shop Docs? This removes it from search.`)) {
      return;
    }

    setDeletingSourceRef(sourceRef);
    setShopDocsError("");
    setShopDocsResult(null);

    try {
      const response = await adminFetch("/api/admin/shop-docs/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceRef }),
      });
      const body = await readJsonResponse<Record<string, unknown> | { error?: string }>(response, "Shop Docs delete failed");
      if (!response.ok) {
        throw new Error(jsonResponseErrorMessage(body, "Shop Docs delete failed"));
      }
      setShopDocsResult(body as ShopDocsUiResult);
    } catch (error) {
      setShopDocsError(error instanceof Error ? error.message : "Shop Docs delete failed");
    } finally {
      setDeletingSourceRef("");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-red-700">Terminal Auto Body</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">Admin Dashboard</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Production maintenance for the public-safe knowledge base.
            </p>
          </div>
          <Link
            className="inline-flex w-fit rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-red-600 hover:text-slate-950"
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
                <div className="mt-5 space-y-4">
                  <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
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
                        disabled={icbcBusy || icbcRefreshBusy}
                        type="button"
                        onClick={() => void runIcbcCheck()}
                      >
                        {icbcBusy ? "Checking..." : "Check ICBC Updates"}
                      </button>
                      <button
                        className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        disabled={icbcBusy || icbcRefreshBusy}
                        type="button"
                        onClick={() => void runIcbcRefresh()}
                      >
                        {icbcRefreshBusy ? "Refreshing..." : "Run Full ICBC Refresh"}
                      </button>
                    </div>

                    <div className="space-y-1 text-sm text-slate-600">
                      <div>
                        Live collection: <span className="font-semibold text-slate-950">{overview.batches[0]?.batchId || "No batch"}</span>
                      </div>
                      <div>
                        Last checked:{" "}
                        <span className="font-semibold text-slate-950">
                          {latestIcbcCheckRun ? formatDate(latestIcbcCheckRun.createdAt) : "Not checked from this admin yet"}
                        </span>
                      </div>
                      <div>
                        Last refreshed:{" "}
                        <span className="font-semibold text-slate-950">
                          {latestIcbcRefreshRun ? formatDate(latestIcbcRefreshRun.createdAt) : "Not refreshed from this admin yet"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <IcbcResultPanel
                    checkResult={icbcResult}
                    error={icbcError}
                    latestCheckRun={latestIcbcCheckRun}
                    latestRefreshRun={latestIcbcRefreshRun}
                    refreshBusy={icbcRefreshBusy}
                    refreshResult={icbcRefreshResult}
                  />
                </div>
                </div>
              ) : null}

              {activeTool === "shop_docs" ? (
                <div className="mt-5 space-y-4">
                  <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-950">Shop Docs Ingestion</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Import public URLs, or upload files to refresh the hosted knowledge base. Re-upload a file with the same
                          name to replace its previous chunks.
                        </p>
                      </div>
                      <label className="block text-sm font-medium text-slate-700" htmlFor="shop-doc-urls">
                        Public document URLs
                        <textarea
                          id="shop-doc-urls"
                          className="mt-2 min-h-32 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
                          value={shopDocsUrls}
                          onChange={(event) => setShopDocsUrls(event.target.value)}
                        />
                      </label>
                      <button
                        className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        disabled={shopDocsBusy || !shopDocsUrls.trim()}
                        type="button"
                        onClick={() => void runShopDocsImport()}
                      >
                        {shopDocsBusy ? "Importing..." : "Import URLs"}
                      </button>
                      <div className="border-t border-slate-200 pt-4">
                        <label className="block text-sm font-medium text-slate-700" htmlFor="shop-doc-files">
                          Upload files
                          <input
                            id="shop-doc-files"
                            className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                            type="file"
                            multiple
                            accept=".pdf,.docx,.xlsx,.csv,.md,.markdown,.txt,.html,.htm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,text/html"
                            onChange={(event) => {
                              const files = Array.from(event.target.files || []);
                              setShopDocFiles(files);
                              if (files.length !== 1) {
                                setShopDocDocumentKey("");
                              }
                            }}
                          />
                        </label>
                        {shopDocFiles.length ? (
                          <div className="mt-2 text-xs text-slate-500">
                            {shopDocFiles.map((file) => file.name).join(", ")}
                          </div>
                        ) : null}
                        {shopDocFiles.length === 1 ? (
                          <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor="shop-doc-key">
                            Optional update key
                            <input
                              id="shop-doc-key"
                              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
                              placeholder="Defaults to the file name"
                              value={shopDocDocumentKey}
                              onChange={(event) => setShopDocDocumentKey(event.target.value)}
                            />
                          </label>
                        ) : null}
                        <button
                          className="mt-3 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                          disabled={shopDocsBusy || !shopDocFiles.length}
                          type="button"
                          onClick={() => void runShopDocsFileImport()}
                        >
                          {shopDocsBusy ? "Uploading..." : "Upload / Refresh Files"}
                        </button>
                      </div>
                    </div>
                    <MaintenanceResultPanel
                      busy={shopDocsBusy}
                      busyMessage="Importing Shop Docs. PDFs may take a minute."
                      error={shopDocsError}
                      latestRun={latestShopDocsRun}
                      result={shopDocsResult}
                    />
                  </div>
                  <ShopDocumentsTable
                    deletingSourceRef={deletingSourceRef}
                    documents={overview.shopDocuments}
                    onDelete={(document) => void deleteShopDocument(document.sourceRef, document.title)}
                  />
                </div>
              ) : null}

              {activeTool === "mitchell_ceg" ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">Mitchell CEG Maintenance</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Crawl the public Mitchell CEG P-pages and import them as hosted shop docs.
                      </p>
                    </div>
                    <button
                      className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={mitchellBusy}
                      type="button"
                      onClick={() => void runMitchellRefresh()}
                    >
                      {mitchellBusy ? "Refreshing..." : "Refresh Mitchell CEG"}
                    </button>
                  </div>
                  <MaintenanceResultPanel
                    busy={mitchellBusy}
                    busyMessage="Refreshing Mitchell CEG pages. This can take a minute or two."
                    error={mitchellError}
                    latestRun={latestMitchellRun}
                    result={mitchellResult}
                  />
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
                        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
                        value={batchId}
                        onChange={(event) => setBatchId(event.target.value)}
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700" htmlFor="knowledge-type">
                      Type
                      <select
                        id="knowledge-type"
                        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
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
                      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-red-600 disabled:cursor-not-allowed disabled:opacity-50"
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
                          <a className="mt-1 inline-block text-red-700 hover:text-red-900" href={source.sourceUrl}>
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

function IcbcResultPanel({
  checkResult,
  error,
  latestCheckRun,
  latestRefreshRun,
  refreshBusy,
  refreshResult,
}: {
  checkResult: IcbcCheckUiResult | null;
  error: string;
  latestCheckRun: AdminOverview["maintenanceRuns"][number] | null;
  latestRefreshRun: AdminOverview["maintenanceRuns"][number] | null;
  refreshBusy: boolean;
  refreshResult: IcbcRefreshUiResult | null;
}) {
  if (error) {
    return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>;
  }

  if (refreshBusy) {
    return <EmptyMessage>Refreshing ICBC procedures. This can take a minute or two.</EmptyMessage>;
  }

  if (refreshResult) {
    return <IcbcRefreshResultPanel result={refreshResult} />;
  }

  if (!checkResult) {
    if (latestRefreshRun) {
      return (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="font-semibold text-slate-950">Latest ICBC refresh</div>
          <div className="mt-1 text-slate-600">{latestRefreshRun.summary}</div>
          <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {latestRefreshRun.status} - {formatDate(latestRefreshRun.createdAt)}
          </div>
        </div>
      );
    }

    return latestCheckRun ? (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="font-semibold text-slate-950">Latest ICBC check</div>
        <div className="mt-1 text-slate-600">{latestCheckRun.summary}</div>
        <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {latestCheckRun.status} - {formatDate(latestCheckRun.createdAt)}
        </div>
      </div>
    ) : (
      <EmptyMessage>ICBC maintenance results will appear here.</EmptyMessage>
    );
  }

  const comparison = checkResult.comparison;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide ${
              checkResult.status === "up_to_date" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {checkResult.status === "up_to_date" ? "Up to date" : "Updates found"}
          </span>
          <span className="text-sm text-slate-500">{formatDate(checkResult.checkedAt)}</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-700">{checkResult.summary}</p>
        {checkResult.logWarning ? <p className="mt-2 text-sm text-amber-700">{checkResult.logWarning}</p> : null}
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
              <a className="font-medium text-red-700 hover:text-red-900" href={entry.sourceUrl}>
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

function IcbcRefreshResultPanel({ result }: { result: IcbcRefreshUiResult }) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-red-200 bg-red-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-red-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-red-800">
            Refresh complete
          </span>
          <span className="text-sm text-red-900">{formatDate(result.refreshedAt)}</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-red-950">{result.summary}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <CompactMetric label="Topics found" value={result.topicsFound} />
        <CompactMetric label="Topics imported" value={result.topicsImported} />
        <CompactMetric label="Chunks imported" value={result.chunksUpserted} />
        <CompactMetric label="Old sources deleted" value={result.oldSourcesDeleted} />
        <CompactMetric label="Old chunks deleted" value={result.oldChunksDeleted} />
        <CompactMetric label="Seconds" value={Math.round(result.durationMs / 1000)} />
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-4 text-sm">
        <div className="font-semibold text-slate-950">{result.batchId}</div>
        <div className="mt-1 text-slate-600">New live ICBC batch</div>
      </div>
    </div>
  );
}

function ShopDocumentsTable({
  deletingSourceRef,
  documents,
  onDelete,
}: {
  deletingSourceRef: string;
  documents: AdminShopDocument[];
  onDelete: (document: AdminShopDocument) => void;
}) {
  if (!documents.length) {
    return <EmptyMessage>No Shop Docs documents found.</EmptyMessage>;
  }

  return (
    <div className="rounded-md border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-950">Shop Docs Document Manager</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-white text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Document</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Chunks</th>
              <th className="px-4 py-3">Last Imported</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {documents.map((document) => (
              <tr key={document.sourceRef}>
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-slate-950">{document.title}</div>
                  <div className="mt-1 max-w-sm break-all text-xs text-slate-500">{document.documentKey}</div>
                </td>
                <td className="px-4 py-3 align-top text-slate-700">{document.fileType.toUpperCase()}</td>
                <td className="px-4 py-3 align-top text-slate-700">
                  {document.chunkCount.toLocaleString()} chunks
                  <div className="text-xs text-slate-500">{document.sourceCount.toLocaleString()} source rows</div>
                </td>
                <td className="px-4 py-3 align-top text-slate-700">{formatDate(document.importedAt)}</td>
                <td className="px-4 py-3 align-top">
                  {document.sourceUrl ? (
                    <a className="text-red-700 hover:text-red-900" href={document.sourceUrl}>
                      Open
                    </a>
                  ) : (
                    <span className="text-slate-500">Uploaded file</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right align-top">
                  <button
                    className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={Boolean(deletingSourceRef)}
                    type="button"
                    onClick={() => onDelete(document)}
                  >
                    {deletingSourceRef === document.sourceRef ? "Deleting..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MaintenanceResultPanel({
  busy,
  busyMessage,
  error,
  latestRun,
  result,
}: {
  busy: boolean;
  busyMessage: string;
  error: string;
  latestRun: AdminOverview["maintenanceRuns"][number] | null;
  result: unknown | null;
}) {
  if (error) {
    return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>;
  }

  if (busy) {
    return <EmptyMessage>{busyMessage}</EmptyMessage>;
  }

  if (result) {
    return (
      <pre className="max-h-96 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-white">
        {JSON.stringify(result, null, 2)}
      </pre>
    );
  }

  if (latestRun) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="font-semibold text-slate-950">Latest run</div>
        <div className="mt-1 text-slate-600">{latestRun.summary}</div>
        <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {latestRun.status} - {formatDate(latestRun.createdAt)}
        </div>
      </div>
    );
  }

  return <EmptyMessage>Maintenance results will appear here.</EmptyMessage>;
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
      ? "border-red-200 bg-red-50 text-red-900"
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

function withAdminBypassHeader(init: RequestInit, token: string): RequestInit {
  if (!token) {
    return init;
  }

  const headers = new Headers(init.headers);
  headers.set(ADMIN_BYPASS_HEADER, token);
  return { ...init, headers };
}
