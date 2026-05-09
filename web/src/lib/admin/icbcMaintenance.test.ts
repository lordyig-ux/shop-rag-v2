import { describe, expect, it } from "vitest";

import {
  buildIcbcCheckResult,
  compareIcbcSources,
  parseIcbcNavEntries,
  sourceRefsToPreserveAfterRefresh,
  topicIdFromIcbcSource,
  verifyIcbcNotListedSources,
} from "./icbcMaintenance";

describe("parseIcbcNavEntries", () => {
  it("parses ICBC topicrefs and builds public source URLs", () => {
    const xml = `
      <map>
        <topicref href="DAMG-CO-KLH43Y-ndv-vehs-tows" navtitle="Non-drivable vehicles &amp; tows" />
        <topicref navtitle='Pre-repair &amp; post-repair scanning policy' href='Policy-on-pre-repair-and-post-repair-scanning' />
      </map>
    `;

    expect(parseIcbcNavEntries(xml)).toEqual([
      {
        topicId: "DAMG-CO-KLH43Y-ndv-vehs-tows",
        href: "DAMG-CO-KLH43Y-ndv-vehs-tows",
        title: "Non-drivable vehicles & tows",
        category: "ICBC",
        sourceUrl: "https://mdp.partners.icbc.com/topic/DAMG-CO-KLH43Y-ndv-vehs-tows?map=DAMG-MP-NRP91J-vendors",
      },
      {
        topicId: "Policy-on-pre-repair-and-post-repair-scanning",
        href: "Policy-on-pre-repair-and-post-repair-scanning",
        title: "Pre-repair & post-repair scanning policy",
        category: "ICBC",
        sourceUrl:
          "https://mdp.partners.icbc.com/topic/Policy-on-pre-repair-and-post-repair-scanning?map=DAMG-MP-NRP91J-vendors",
      },
    ]);
  });

  it("builds source URLs for a specified ICBC map", () => {
    const xml = `<map><topicref href="CLMS-RF-I638DJ-grp-crp-updates" navtitle="Program updates" /></map>`;

    expect(parseIcbcNavEntries(xml, "md-vendor-change-alerts")).toEqual([
      {
        topicId: "CLMS-RF-I638DJ-grp-crp-updates",
        href: "CLMS-RF-I638DJ-grp-crp-updates",
        title: "Program updates",
        category: "ICBC",
        sourceUrl: "https://mdp.partners.icbc.com/topic/CLMS-RF-I638DJ-grp-crp-updates?map=md-vendor-change-alerts",
      },
    ]);
  });
});

describe("parseIcbcNavEntries categories", () => {
  it("uses parent topicrefs as the category path", () => {
    const xml = `
      <map>
        <topicref href="repairs" navtitle="Repairs">
          <topicref href="light-duty" navtitle="Light duty estimates">
            <topicref href="scanning-policy" navtitle="Scanning policy" />
          </topicref>
        </topicref>
      </map>
    `;

    expect(parseIcbcNavEntries(xml).map((entry) => ({ title: entry.title, category: entry.category }))).toEqual([
      { title: "Repairs", category: "ICBC" },
      { title: "Light duty estimates", category: "Repairs" },
      { title: "Scanning policy", category: "Repairs > Light duty estimates" },
    ]);
  });
});

describe("topicIdFromIcbcSource", () => {
  it("normalizes topic IDs from current source refs and URLs", () => {
    expect(
      topicIdFromIcbcSource({
        title: "Pre-repair and post-repair scanning policy",
        sourceRef: "https://mdp.partners.icbc.com/topics/Policy-on-pre-repair-and-post-repair-scanning.html",
        sourceUrl:
          "https://mdp.partners.icbc.com/topic/Policy-on-pre-repair-and-post-repair-scanning?map=DAMG-MP-NRP91J-vendors",
        importedBatchId: "public-safe-v1",
        importedAt: 100,
      }),
    ).toBe("policy-on-pre-repair-and-post-repair-scanning");
  });
});

describe("compareIcbcSources", () => {
  it("reports ICBC nav entries missing from the current knowledge base", () => {
    const comparison = compareIcbcSources(
      [
        {
          topicId: "Policy-on-pre-repair-and-post-repair-scanning",
          href: "Policy-on-pre-repair-and-post-repair-scanning",
          title: "Pre-repair and post-repair scanning policy",
          category: "ICBC",
          sourceUrl:
            "https://mdp.partners.icbc.com/topic/Policy-on-pre-repair-and-post-repair-scanning?map=DAMG-MP-NRP91J-vendors",
        },
        {
          topicId: "New-ICBC-topic",
          href: "New-ICBC-topic",
          title: "New ICBC topic",
          category: "ICBC",
          sourceUrl: "https://mdp.partners.icbc.com/topic/New-ICBC-topic?map=DAMG-MP-NRP91J-vendors",
        },
      ],
      [
        {
          title: "Pre-repair and post-repair scanning policy",
          sourceRef: "https://mdp.partners.icbc.com/topics/Policy-on-pre-repair-and-post-repair-scanning.html",
          sourceUrl:
            "https://mdp.partners.icbc.com/topic/Policy-on-pre-repair-and-post-repair-scanning?map=DAMG-MP-NRP91J-vendors",
          importedBatchId: "public-safe-v1",
          importedAt: 100,
        },
        {
          title: "Removed ICBC topic",
          sourceRef: "https://mdp.partners.icbc.com/topics/Removed-ICBC-topic.html",
          sourceUrl: "https://mdp.partners.icbc.com/topic/Removed-ICBC-topic?map=DAMG-MP-NRP91J-vendors",
          importedBatchId: "public-safe-v1",
          importedAt: 100,
        },
      ],
    );

    expect(comparison.totalLatest).toBe(2);
    expect(comparison.totalCurrent).toBe(2);
    expect(comparison.unchangedCount).toBe(1);
    expect(comparison.missingFromKnowledgeBase.map((entry) => entry.topicId)).toEqual(["New-ICBC-topic"]);
    expect(comparison.notListedInNav.map((source) => source.title)).toEqual(["Removed ICBC topic"]);
    expect(comparison.notListedInNav[0].directUrlStatus).toBe("unchecked");
  });

  it("summarizes an up-to-date check result", () => {
    const result = buildIcbcCheckResult(
      [
        {
          topicId: "Existing-topic",
          href: "Existing-topic",
          title: "Existing topic",
          category: "ICBC",
          sourceUrl: "https://mdp.partners.icbc.com/topic/Existing-topic?map=DAMG-MP-NRP91J-vendors",
        },
      ],
      [
        {
          title: "Existing topic",
          sourceRef: "https://mdp.partners.icbc.com/topics/Existing-topic.html",
          sourceUrl: "https://mdp.partners.icbc.com/topic/Existing-topic?map=DAMG-MP-NRP91J-vendors",
          importedBatchId: "public-safe-v1",
          importedAt: 100,
        },
      ],
      123,
    );

    expect(result.status).toBe("up_to_date");
    expect(result.checkedAt).toBe(123);
    expect(result.summary).toBe("ICBC maps have 1 listed topics and the knowledge base has the same listed topic set.");
  });
});

describe("verifyIcbcNotListedSources", () => {
  it("marks nav-missing sources as live when their direct URL still responds", async () => {
    const verified = await verifyIcbcNotListedSources(
      [
        {
          title: "Replacement parts where depreciation does not apply",
          sourceRef: "https://mdp.partners.icbc.com/topics/50CBF8B994B539D601815B01FC497FD5.html",
          sourceUrl: "https://mdp.partners.icbc.com/topic/50CBF8B994B539D601815B01FC497FD5?map=DAMG-MP-NRP91J-vendors",
          importedBatchId: "icbc-refresh-1",
          importedAt: 100,
        },
      ],
      {
        fetchFn: async () => new Response("<title>Replacement parts where depreciation does not apply</title>", { status: 200 }),
      },
    );

    expect(verified[0]).toMatchObject({
      title: "Replacement parts where depreciation does not apply",
      topicId: "50cbf8b994b539d601815b01fc497fd5",
      directUrlStatus: "live",
      httpStatus: 200,
    });
  });

  it("preserves live or check-failed ICBC pages during refresh and allows confirmed not-found pages to be deleted", () => {
    expect(
      sourceRefsToPreserveAfterRefresh([
        {
          title: "Live orphan",
          sourceRef: "live-ref",
          sourceUrl: "https://example.test/live",
          importedBatchId: "batch",
          importedAt: 1,
          topicId: "live",
          checkedUrl: "https://example.test/live",
          directUrlStatus: "live",
          httpStatus: 200,
        },
        {
          title: "Network issue",
          sourceRef: "unknown-ref",
          sourceUrl: "https://example.test/unknown",
          importedBatchId: "batch",
          importedAt: 1,
          topicId: "unknown",
          checkedUrl: "https://example.test/unknown",
          directUrlStatus: "check_failed",
          httpStatus: null,
          checkError: "timeout",
        },
        {
          title: "Dead page",
          sourceRef: "dead-ref",
          sourceUrl: "https://example.test/dead",
          importedBatchId: "batch",
          importedAt: 1,
          topicId: "dead",
          checkedUrl: "https://example.test/dead",
          directUrlStatus: "not_found",
          httpStatus: 404,
        },
      ]),
    ).toEqual(["live-ref", "unknown-ref"]);
  });
});
