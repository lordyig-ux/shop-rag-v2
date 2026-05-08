async function fetchJson(url, options = {}) {
  const requestUrl = url.startsWith("/") ? new URL(url, window.location.origin).toString() : url;
  const response = await fetch(requestUrl, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderWarnings(warnings) {
  if (!warnings || warnings.length === 0) return "";
  return `<div class="warning">${warnings.map(escapeHtml).join(", ")}</div>`;
}

function initStaffPage() {
  const form = document.querySelector("#query-form");
  const answerArea = document.querySelector("#answer-area");
  if (!form || !answerArea) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = form.question.value.trim();
    if (!question) return;
    answerArea.innerHTML = `<div class="empty-state">Searching all indexed sources...</div>`;

    try {
      const data = await fetchJson("/api/query", {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      answerArea.innerHTML = renderAnswer(data);
    } catch (error) {
      answerArea.innerHTML = `<div class="warning">Query failed: ${escapeHtml(error.message)}</div>`;
    }
  });

  document.querySelectorAll("[data-example-question]").forEach((button) => {
    button.addEventListener("click", () => {
      form.question.value = button.dataset.exampleQuestion || "";
      form.requestSubmit();
    });
  });
}

function renderAnswer(data) {
  const citations = data.citations || [];
  return `
    ${renderWarnings(data.warnings)}
    <section class="answer-card">
      <h2>Answer</h2>
      <div>${escapeHtml(data.answer).replaceAll("\n", "<br>")}</div>
      <p class="citation-meta">Mode: ${escapeHtml(data.retrieval?.retrieval_mode)} | Chunks used: ${escapeHtml(data.retrieval?.used_chunks ?? 0)}</p>
    </section>
    <section class="source-list">
      <h2>Sources</h2>
      ${citations.length ? citations.map(renderCitation).join("") : '<p class="muted">No citations available.</p>'}
    </section>
  `;
}

function renderCitation(citation, index) {
  const linkUrl = citation.source_url_with_page || citation.source_url;
  const pageLabel = citation.page_range ? `Page ${escapeHtml(citation.page_range)}` : "";
  const source = linkUrl
    ? `<a href="${escapeHtml(linkUrl)}" target="_blank" rel="noreferrer">${pageLabel ? `Open PDF to ${pageLabel}` : escapeHtml(linkUrl)}</a>`
    : `<span class="muted">No source URL available</span>`;
  return `
    <article class="citation">
      <h3>[${index + 1}] ${escapeHtml(citation.title)}</h3>
      <div class="citation-meta">Collection: ${escapeHtml(citation.collection)}${pageLabel ? ` | ${pageLabel}` : ""} | Chunk: ${escapeHtml(citation.chunk_id)} | Score: ${escapeHtml(citation.score)}</div>
      <div>${source}</div>
      ${citation.source_url && citation.source_url_with_page ? `<div class="citation-meta">Original PDF: <a href="${escapeHtml(citation.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(citation.source_url)}</a></div>` : ""}
      <details>
        <summary>Source excerpt</summary>
        <div class="excerpt">${escapeHtml(citation.excerpt)}</div>
      </details>
    </article>
  `;
}

async function initAdminPage() {
  if (document.body.dataset.page !== "admin") return;
  initAdminTabs();

  await Promise.allSettled([
    loadAdminJson("/api/health", "#admin-health", renderHealth),
    loadAdminJson("/api/admin/collections", "#admin-collections", renderCollections),
    loadAdminJson("/api/admin/schema", "#admin-schema", (data) => JSON.stringify(data, null, 2)),
    loadAdminJson("/api/admin/recent-queries", "#admin-queries", renderRecords),
    loadAdminJson("/api/admin/errors", "#admin-errors", renderRecords),
    loadAdminJson("/api/admin/report", "#admin-report", (data) => data.content),
    loadAdminJson("/api/admin/maintenance", "#admin-maintenance", renderMaintenance),
    loadAdminJson("/api/admin/jobs/current", "#admin-job-status", renderJob),
    loadAdminJson("/api/admin/source-index?limit=25", "#admin-source-index", renderSourceIndex),
  ]);
  setInterval(() => {
    loadAdminJson("/api/admin/jobs/current", "#admin-job-status", renderJob);
  }, 3000);

  const form = document.querySelector("#admin-test-form");
  const output = document.querySelector("#admin-test-result");
  if (form && output) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      output.textContent = "Running...";
      try {
        const data = await fetchJson("/api/admin/test-query", {
          method: "POST",
          body: JSON.stringify({ question: document.querySelector("#admin-test-question").value || "test retrieval" }),
        });
        output.textContent = JSON.stringify(data, null, 2);
      } catch (error) {
        output.textContent = `Failed: ${error.message}`;
      }
    });
  }

  const scanButton = document.querySelector("#scan-shop-docs");
  const scanOutput = document.querySelector("#admin-shop-docs-scan");
  if (scanButton && scanOutput) {
    scanButton.addEventListener("click", async () => {
      scanOutput.textContent = "Scanning shop-doc inbox...";
      try {
        const data = await fetchJson("/api/admin/shop-docs/scan");
        scanOutput.textContent = JSON.stringify(data, null, 2);
      } catch (error) {
        scanOutput.textContent = `Scan failed: ${error.message}`;
      }
    });
  }

  const cleanupButton = document.querySelector("#cleanup-staging-collections");
  const cleanupOutput = document.querySelector("#cleanup-staging-result");
  if (cleanupButton && cleanupOutput) {
    cleanupButton.addEventListener("click", async () => {
      if (!window.confirm("Delete Qdrant collections ending in _staging? Live collections will not be deleted.")) return;
      cleanupButton.disabled = true;
      cleanupOutput.textContent = "Cleaning up staging collections...";
      try {
        const data = await fetchJson("/api/admin/cleanup/staging-collections", {
          method: "POST",
          body: "{}",
        });
        cleanupOutput.textContent = JSON.stringify(data, null, 2);
        await loadAdminJson("/api/admin/collections", "#admin-collections", renderCollections);
      } catch (error) {
        cleanupOutput.textContent = `Cleanup failed: ${error.message}`;
      } finally {
        cleanupButton.disabled = false;
      }
    });
  }

  const sourceForm = document.querySelector("#admin-source-index-form");
  if (sourceForm) {
    sourceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const query = document.querySelector("#admin-source-index-query").value.trim();
      await loadAdminJson(`/api/admin/source-index?limit=25&q=${encodeURIComponent(query)}`, "#admin-source-index", renderSourceIndex);
    });
  }
}

function initAdminTabs() {
  const tabButtons = document.querySelectorAll("[data-admin-tab]");
  const panels = document.querySelectorAll("[data-admin-panel]");
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.adminTab;
      tabButtons.forEach((item) => item.classList.toggle("active", item === button));
      panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.adminPanel === tab));
    });
  });
}

async function loadAdminJson(url, selector, renderer) {
  const element = document.querySelector(selector);
  if (!element) return;
  try {
    const data = await fetchJson(url);
    element.innerHTML = escapeForPre(selector, renderer(data));
  } catch (error) {
    element.textContent = `Failed to load: ${error.message}`;
  }
}

function escapeForPre(selector, content) {
  if (selector.includes("schema") || selector.includes("report")) {
    return escapeHtml(content);
  }
  return content;
}

function renderHealth(data) {
  const qdrantClass = data.qdrant?.connected ? "status-pill" : "status-pill bad";
  const openaiClass = data.openai?.configured ? "status-pill" : "status-pill bad";
  const ollamaClass = data.ollama?.connected ? "status-pill" : "status-pill bad";
  return `
    <div>App: ${escapeHtml(data.app)}</div>
    <div>Answer provider: <strong>${escapeHtml(data.answer_provider)}</strong></div>
    <div>Qdrant: <span class="${qdrantClass}">${data.qdrant?.connected ? "connected" : "not connected"}</span></div>
    <div>OpenAI: <span class="${openaiClass}">${data.openai?.configured ? "configured" : "missing key"}</span></div>
    <div>Ollama: <span class="${ollamaClass}">${data.ollama?.connected ? "connected" : "not connected"}</span></div>
    <div class="muted">Ollama model: ${escapeHtml(data.ollama?.model)}</div>
    <div class="muted">Qdrant URL: ${escapeHtml(data.qdrant?.url)}</div>
  `;
}

function renderCollections(data) {
  if (!data.collections?.length) return `<p class="muted">No collections found.</p>`;
  return data.collections.map((collection) => `
    <div class="citation">
      <h3>${escapeHtml(collection.name)}</h3>
      <div class="citation-meta">Points: ${escapeHtml(collection.point_count ?? "unknown")}</div>
      <div class="citation-meta">${data.selected_collection === collection.name ? "Selected" : ""}</div>
      ${data.env_collection_locked ? "" : `<button type="button" data-select-collection="${escapeHtml(collection.name)}">Use this collection</button>`}
      <pre>${escapeHtml(JSON.stringify(collection.vector_dimensions, null, 2))}</pre>
    </div>
  `).join("");
}

document.addEventListener("click", async (event) => {
  const jobButton = event.target.closest("[data-admin-job]");
  if (jobButton) {
    jobButton.disabled = true;
    const originalText = jobButton.textContent;
    jobButton.textContent = "Starting...";
    try {
      const job = jobButton.dataset.adminJob;
      await fetchJson(`/api/admin/jobs/${job}`, { method: "POST", body: "{}" });
      await loadAdminJson("/api/admin/jobs/current", "#admin-job-status", renderJob);
    } catch (error) {
      const output = document.querySelector("#admin-job-status");
      if (output) output.textContent = `Failed to start job: ${error.message}`;
    } finally {
      jobButton.disabled = false;
      jobButton.textContent = originalText;
    }
    return;
  }

  const pageButton = event.target.closest("[data-source-index-offset]");
  if (pageButton) {
    const query = document.querySelector("#admin-source-index-query")?.value.trim() || "";
    const offset = pageButton.dataset.sourceIndexOffset || "0";
    await loadAdminJson(
      `/api/admin/source-index?limit=25&offset=${encodeURIComponent(offset)}&q=${encodeURIComponent(query)}`,
      "#admin-source-index",
      renderSourceIndex
    );
    return;
  }

  const button = event.target.closest("[data-select-collection]");
  if (!button) return;
  button.disabled = true;
  try {
    await fetchJson("/api/admin/select-collection", {
      method: "POST",
      body: JSON.stringify({ collection: button.dataset.selectCollection }),
    });
    await loadAdminJson("/api/admin/collections", "#admin-collections", renderCollections);
  } catch (error) {
    button.textContent = `Failed: ${error.message}`;
  } finally {
    button.disabled = false;
  }
});

function renderRecords(records) {
  if (!records?.length) return `<p class="muted">No records yet.</p>`;
  return records.map((record) => `
    <div class="citation">
      <div class="citation-meta">${escapeHtml(record.timestamp)}</div>
      <div>${escapeHtml(record.question || record.message || "")}</div>
      <pre>${escapeHtml(JSON.stringify(record, null, 2))}</pre>
    </div>
  `).join("");
}

function renderMaintenance(data) {
  return `
    <div>Live ICBC collection: <strong>${escapeHtml(data.live_icbc_collection || "icbc_procedures")}</strong></div>
    <div>Last checked: ${escapeHtml(data.last_checked || "never")}</div>
    <div>Last refreshed: ${escapeHtml(data.last_refreshed || "never")}</div>
    <div>Next recommended check: ${escapeHtml(data.next_recommended_check || "not scheduled")}</div>
    <div class="muted">Shop-doc inbox: ${escapeHtml(data.shop_docs_inbox_path || "")}</div>
  `;
}

function renderJob(job) {
  if (!job) return "No maintenance job has run yet.";
  return JSON.stringify(job, null, 2);
}

function renderSourceIndex(data) {
  const items = data.items || [];
  if (!items.length) return `<p class="muted">No indexed sources found yet. Run an ICBC refresh or shop-doc import to populate this catalog.</p>`;
  const previousOffset = Math.max(0, (data.offset || 0) - (data.limit || 25));
  const nextOffset = (data.offset || 0) + (data.limit || 25);
  const controls = `
    <div class="button-row">
      <button type="button" data-source-index-offset="${previousOffset}" ${data.offset <= 0 ? "disabled" : ""}>Previous</button>
      <button type="button" data-source-index-offset="${nextOffset}" ${nextOffset >= data.total ? "disabled" : ""}>Next</button>
    </div>
  `;
  return `
    <div class="citation-meta">Showing ${escapeHtml(items.length)} of ${escapeHtml(data.total)} sources</div>
    ${controls}
    ${items.map((item) => `
      <article class="citation">
        <h3>${escapeHtml(item.title)}</h3>
        <div class="citation-meta">
          ${escapeHtml(item.knowledge_type)} | ${escapeHtml(item.collection)} | ${escapeHtml(item.file_type)} | Chunks: ${escapeHtml(item.chunk_count)}
        </div>
        <div>${item.source_url ? `<a href="${escapeHtml(item.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.source_url)}</a>` : escapeHtml(item.source_ref)}</div>
        <div class="muted">${escapeHtml(item.category || "")}</div>
      </article>
    `).join("")}
    ${controls}
  `;
}

function initSourcesPage() {
  const form = document.querySelector("#source-search-form");
  const results = document.querySelector("#sources-results");
  if (!form || !results) return;

  async function loadSources(query = "") {
    results.innerHTML = `<div class="empty-state">Loading sources...</div>`;
    try {
      const data = await fetchJson(`/api/sources?q=${encodeURIComponent(query)}`);
      results.innerHTML = renderWarnings(data.warnings) + renderSources(data.sources || []);
    } catch (error) {
      results.innerHTML = `<div class="warning">Source search failed: ${escapeHtml(error.message)}</div>`;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    loadSources(document.querySelector("#source-search").value.trim());
  });
  loadSources();
}

function renderSources(sources) {
  if (!sources.length) return `<div class="panel muted">No sources found.</div>`;
  return sources.map((source) => `
    <article class="source-item">
      <h2>${escapeHtml(source.title)}</h2>
      <div class="citation-meta">Collection: ${escapeHtml(source.collection)} | Chunks: ${escapeHtml(source.chunk_count)}</div>
      ${source.source_url ? `<a href="${escapeHtml(source.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(source.source_url)}</a>` : '<p class="muted">No source URL available</p>'}
      ${(source.chunks || []).map((chunk) => `
        <details>
          <summary>${escapeHtml(chunk.chunk_id)}${chunk.page_range ? ` | Page ${escapeHtml(chunk.page_range)}` : ""}</summary>
          ${chunk.source_url_with_page ? `<div><a href="${escapeHtml(chunk.source_url_with_page)}" target="_blank" rel="noreferrer">Open PDF to page ${escapeHtml(chunk.page_range || chunk.page_number)}</a></div>` : ""}
          <div class="excerpt">${escapeHtml(chunk.excerpt)}</div>
        </details>
      `).join("")}
    </article>
  `).join("");
}

initStaffPage();
initAdminPage();
initSourcesPage();
