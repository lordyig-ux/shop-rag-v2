import { describe, expect, it } from "vitest";

import type { IcbcNavEntry } from "./icbcMaintenance";
import {
  buildIcbcRefreshRecords,
  extractIcbcArticleText,
  makeIcbcRefreshBatchId,
} from "./icbcRefresh";

const entry: IcbcNavEntry = {
  topicId: "Policy-on-pre-repair-and-post-repair-scanning",
  href: "Policy-on-pre-repair-and-post-repair-scanning",
  title: "Pre-repair and post-repair scanning policy",
  category: "Repairs > Light duty estimates > Estimating technical",
  sourceUrl:
    "https://mdp.partners.icbc.com/topic/Policy-on-pre-repair-and-post-repair-scanning?map=DAMG-MP-NRP91J-vendors",
};

describe("extractIcbcArticleText", () => {
  it("extracts readable article markdown from an ICBC topic page", () => {
    const html = `
      <html>
        <body>
          <nav>loading map</nav>
          <article>
            <div class="topic-body">
              <div class="update-date">Last updated 2021-10-28</div>
              <h1 class="title">Pre-repair and post-repair scanning policy</h1>
              <p class="shortdesc">Overview of diagnostic scanning.</p>
              <div class="section">
                <h3 class="sectiontitle">Policy</h3>
                <p>Pre-repair scans happen before tear down.</p>
                <ul><li>MIL present</li><li>Non-driveable vehicle</li></ul>
              </div>
              <div class="related-links">Parent topic: Estimating technical</div>
            </div>
          </article>
          <footer>copyright</footer>
        </body>
      </html>
    `;

    expect(extractIcbcArticleText(html)).toBe(
      [
        "Last updated 2021-10-28",
        "# Pre-repair and post-repair scanning policy",
        "Overview of diagnostic scanning.",
        "### Policy",
        "Pre-repair scans happen before tear down.",
        "- MIL present",
        "- Non-driveable vehicle",
        "Parent topic: Estimating technical",
      ].join("\n\n"),
    );
  });
});

describe("buildIcbcRefreshRecords", () => {
  it("builds normalized Convex import records for refreshed ICBC topic content", () => {
    const html = `
      <article>
        <h1>Pre-repair and post-repair scanning policy</h1>
        <p>Overview of diagnostic scanning.</p>
        <h3>Policy</h3>
        <p>Shops must keep scan documentation.</p>
      </article>
      <meta name="last_update" content="2021-10-28" />
    `;

    const result = buildIcbcRefreshRecords({
      batchId: "icbc-refresh-2026-05-02",
      entry,
      html,
      maxChunkChars: 500,
    });

    expect(result).toMatchObject({
      topicId: entry.topicId,
      title: entry.title,
      sourceUrl: entry.sourceUrl,
      contentUrl: "https://mdp.partners.icbc.com/topics/Policy-on-pre-repair-and-post-repair-scanning.html",
      skippedReason: null,
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0].source).toEqual({
      sourceId: `insurance_policy:${entry.sourceUrl}`,
      title: entry.title,
      category: entry.category,
      sourceRef: "https://mdp.partners.icbc.com/topics/Policy-on-pre-repair-and-post-repair-scanning.html",
      sourceUrl: entry.sourceUrl,
      fileType: "html",
      knowledgeType: "insurance_policy",
      contentHash: expect.stringMatching(/^[a-f0-9]{40}$/),
      modifiedAt: "2021-10-28",
      importedBatchId: "icbc-refresh-2026-05-02",
    });
    expect(result.records[0].chunk).toMatchObject({
      chunkId: "Policy-on-pre-repair-and-post-repair-scanning_chunk_0",
      sourceId: `insurance_policy:${entry.sourceUrl}`,
      title: entry.title,
      category: entry.category,
      sourceUrl: entry.sourceUrl,
      sourceRef: "https://mdp.partners.icbc.com/topics/Policy-on-pre-repair-and-post-repair-scanning.html",
      knowledgeType: "insurance_policy",
      chunkIndex: 0,
      totalChunks: 1,
      importedBatchId: "icbc-refresh-2026-05-02",
    });
    expect(result.records[0].chunk.text).toContain("# Pre-repair and post-repair scanning policy");
  });

  it("reports a skipped topic when no article text can be extracted", () => {
    const result = buildIcbcRefreshRecords({
      batchId: "icbc-refresh-2026-05-02",
      entry,
      html: "<html><body><nav>No article here</nav></body></html>",
      maxChunkChars: 500,
    });

    expect(result.records).toEqual([]);
    expect(result.skippedReason).toBe("empty_article");
  });
});

describe("makeIcbcRefreshBatchId", () => {
  it("uses a stable timestamp-based batch id", () => {
    expect(makeIcbcRefreshBatchId(new Date("2026-05-02T22:30:05.000Z"))).toBe("icbc-refresh-2026-05-02-223005");
  });
});
