import {
  type KnowledgeType,
  type NormalizedChunkRecord,
  normalizeChunkRecord,
} from "./normalizeChunk";

export type ImportSkippedLine = {
  line: number;
  reason: "invalid_json" | "empty_or_malformed_record";
};

export type ParseChunkJsonlOptions = {
  batchId: string;
  defaultKnowledgeType?: KnowledgeType;
};

export type ParseChunkJsonlResult = {
  records: NormalizedChunkRecord[];
  skipped: ImportSkippedLine[];
};

export function parseChunkJsonl(text: string, options: ParseChunkJsonlOptions): ParseChunkJsonlResult {
  const records: NormalizedChunkRecord[] = [];
  const skipped: ImportSkippedLine[] = [];

  text.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      skipped.push({ line: lineNumber, reason: "invalid_json" });
      return;
    }

    const normalized = normalizeChunkRecord(raw, options);
    if (!normalized) {
      skipped.push({ line: lineNumber, reason: "empty_or_malformed_record" });
      return;
    }

    records.push(normalized);
  });

  return { records, skipped };
}
