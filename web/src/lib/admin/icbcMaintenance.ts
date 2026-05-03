export const ICBC_MAP_NAME = "DAMG-MP-NRP91J-vendors";
export const ICBC_NAV_XML_URL = `https://mdp.partners.icbc.com/maps/nav_${ICBC_MAP_NAME}.xml`;
export const ICBC_TOPIC_BASE_URL = "https://mdp.partners.icbc.com/topic";

export type IcbcNavEntry = {
  topicId: string;
  href: string;
  title: string;
  category: string;
  sourceUrl: string;
};

export type IcbcSourceSnapshot = {
  title: string;
  sourceRef: string;
  sourceUrl: string | null;
  importedBatchId: string;
  importedAt: number;
};

export type IcbcTitleChange = {
  topicId: string;
  latestTitle: string;
  currentTitle: string;
  sourceUrl: string;
};

export type IcbcUpdateComparison = {
  totalLatest: number;
  totalCurrent: number;
  unchangedCount: number;
  missingFromKnowledgeBase: IcbcNavEntry[];
  staleInKnowledgeBase: IcbcSourceSnapshot[];
  titleChanges: IcbcTitleChange[];
};

export type IcbcCheckResult = {
  checkedAt: number;
  status: "up_to_date" | "updates_found";
  summary: string;
  comparison: IcbcUpdateComparison;
};

export function parseIcbcNavEntries(xml: string): IcbcNavEntry[] {
  const entries: IcbcNavEntry[] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const topicTokens = xml.match(/<\/topicref\s*>|<topicref\b[^>]*>/gi) || [];

  for (const token of topicTokens) {
    if (/^<\/topicref/i.test(token)) {
      stack.pop();
      continue;
    }

    const attributes = parseXmlAttributes(token);
    const href = attributes.href?.trim();
    const title = attributes.navtitle?.trim();
    const selfClosing = /\/\s*>$/.test(token);

    if (!href || !title) {
      if (title && !selfClosing) {
        stack.push(title);
      }
      continue;
    }

    const topicId = normalizeRawTopicId(href);
    const canonicalId = canonicalIcbcTopicId(topicId);
    if (!topicId || !canonicalId || seen.has(canonicalId)) {
      continue;
    }

    seen.add(canonicalId);
    entries.push({
      topicId,
      href,
      title,
      category: stack.length ? stack.join(" > ") : "ICBC",
      sourceUrl: `${ICBC_TOPIC_BASE_URL}/${encodeURIComponent(topicId)}?map=${ICBC_MAP_NAME}`,
    });

    if (!selfClosing) {
      stack.push(title);
    }
  }

  return entries;
}

export function topicIdFromIcbcSource(source: IcbcSourceSnapshot): string | null {
  return canonicalIcbcTopicId(source.sourceUrl) || canonicalIcbcTopicId(source.sourceRef);
}

export function compareIcbcSources(
  latestEntries: IcbcNavEntry[],
  currentSources: IcbcSourceSnapshot[],
): IcbcUpdateComparison {
  const currentByTopicId = new Map<string, IcbcSourceSnapshot>();
  for (const source of currentSources) {
    const topicId = topicIdFromIcbcSource(source);
    if (topicId && !currentByTopicId.has(topicId)) {
      currentByTopicId.set(topicId, source);
    }
  }

  const latestIds = new Set<string>();
  const missingFromKnowledgeBase: IcbcNavEntry[] = [];
  const titleChanges: IcbcTitleChange[] = [];
  let unchangedCount = 0;

  for (const entry of latestEntries) {
    const topicId = canonicalIcbcTopicId(entry.topicId);
    if (!topicId) {
      continue;
    }

    latestIds.add(topicId);
    const current = currentByTopicId.get(topicId);
    if (!current) {
      missingFromKnowledgeBase.push(entry);
      continue;
    }

    unchangedCount += 1;
    if (normalizeTitle(current.title) !== normalizeTitle(entry.title)) {
      titleChanges.push({
        topicId: entry.topicId,
        latestTitle: entry.title,
        currentTitle: current.title,
        sourceUrl: entry.sourceUrl,
      });
    }
  }

  const staleInKnowledgeBase = Array.from(currentByTopicId.entries())
    .filter(([topicId]) => !latestIds.has(topicId))
    .map(([, source]) => source);

  return {
    totalLatest: latestEntries.length,
    totalCurrent: currentByTopicId.size,
    unchangedCount,
    missingFromKnowledgeBase,
    staleInKnowledgeBase,
    titleChanges,
  };
}

export function buildIcbcCheckResult(
  latestEntries: IcbcNavEntry[],
  currentSources: IcbcSourceSnapshot[],
  checkedAt = Date.now(),
): IcbcCheckResult {
  const comparison = compareIcbcSources(latestEntries, currentSources);
  const updateCount =
    comparison.missingFromKnowledgeBase.length +
    comparison.staleInKnowledgeBase.length +
    comparison.titleChanges.length;

  return {
    checkedAt,
    status: updateCount > 0 ? "updates_found" : "up_to_date",
    summary:
      updateCount > 0
        ? [
            `ICBC nav has ${comparison.totalLatest} topics.`,
            `${comparison.missingFromKnowledgeBase.length} new topics,`,
            `${comparison.staleInKnowledgeBase.length} stale topics,`,
            `${comparison.titleChanges.length} title changes.`,
          ].join(" ")
        : `ICBC nav has ${comparison.totalLatest} topics and the knowledge base has the same topic set.`,
    comparison,
  };
}

function parseXmlAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(tag)) !== null) {
    attributes[match[1]] = decodeXmlEntities(match[3]);
  }

  return attributes;
}

function normalizeRawTopicId(value: string): string {
  const withoutQuery = value.split(/[?#]/, 1)[0] || value;
  const normalized = withoutQuery.replace(/\\/g, "/").replace(/\.html?$/i, "");
  return normalized.split("/").filter(Boolean).pop()?.trim() || "";
}

function canonicalIcbcTopicId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const cleanValue = value.trim();
  if (!cleanValue) {
    return null;
  }

  const path = pathLikeValue(cleanValue);
  const normalizedPath = path.replace(/\\/g, "/").split(/[?#]/, 1)[0] || path;
  const topicMatch = normalizedPath.match(/\/topics?\/([^/?#]+)$/i);
  const rawTopicId = topicMatch?.[1] || normalizedPath.split("/").filter(Boolean).pop() || "";
  const withoutExtension = rawTopicId.replace(/\.html?$/i, "").trim();

  if (!withoutExtension) {
    return null;
  }

  return decodeURIComponent(withoutExtension).toLowerCase();
}

function pathLikeValue(value: string): string {
  try {
    if (/^https?:\/\//i.test(value)) {
      return new URL(value).pathname;
    }
  } catch {
    return value;
  }

  return value;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, codePoint: string) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint: string) => String.fromCodePoint(parseInt(codePoint, 16)));
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
