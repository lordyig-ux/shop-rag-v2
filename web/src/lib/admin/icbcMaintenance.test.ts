import { describe, expect, it } from "vitest";

import {
  buildIcbcCheckResult,
  compareIcbcSources,
  parseIcbcNavEntries,
  topicIdFromIcbcSource,
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
        sourceUrl: "https://mdp.partners.icbc.com/topic/DAMG-CO-KLH43Y-ndv-vehs-tows?map=DAMG-MP-NRP91J-vendors",
      },
      {
        topicId: "Policy-on-pre-repair-and-post-repair-scanning",
        href: "Policy-on-pre-repair-and-post-repair-scanning",
        title: "Pre-repair & post-repair scanning policy",
        sourceUrl:
          "https://mdp.partners.icbc.com/topic/Policy-on-pre-repair-and-post-repair-scanning?map=DAMG-MP-NRP91J-vendors",
      },
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
          sourceUrl:
            "https://mdp.partners.icbc.com/topic/Policy-on-pre-repair-and-post-repair-scanning?map=DAMG-MP-NRP91J-vendors",
        },
        {
          topicId: "New-ICBC-topic",
          href: "New-ICBC-topic",
          title: "New ICBC topic",
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
    expect(comparison.staleInKnowledgeBase.map((source) => source.title)).toEqual(["Removed ICBC topic"]);
  });

  it("summarizes an up-to-date check result", () => {
    const result = buildIcbcCheckResult(
      [
        {
          topicId: "Existing-topic",
          href: "Existing-topic",
          title: "Existing topic",
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
    expect(result.summary).toBe("ICBC nav has 1 topics and the knowledge base has the same topic set.");
  });
});
