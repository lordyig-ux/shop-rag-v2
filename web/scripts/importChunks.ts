import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ConvexHttpClient } from "convex/browser";

import { convexFunctions } from "../src/lib/convexReferences";
import { type KnowledgeType } from "../src/lib/knowledge/normalizeChunk";
import { parseChunkJsonl } from "../src/lib/knowledge/jsonlImport";

type CliOptions = {
  file: string;
  batch: string;
  knowledgeType: KnowledgeType;
  dryRun: boolean;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const filePath = resolve(process.cwd(), options.file);
  const content = await readFile(filePath, "utf8");
  const parsed = parseChunkJsonl(content, {
    batchId: options.batch,
    defaultKnowledgeType: options.knowledgeType,
  });
  const sourceCount = new Set(parsed.records.map((record) => record.source.sourceId)).size;

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          file: filePath,
          batch: options.batch,
          knowledgeType: options.knowledgeType,
          sources: sourceCount,
          chunks: parsed.records.length,
          skipped: parsed.skipped,
        },
        null,
        2,
      ),
    );
    return;
  }

  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("Set CONVEX_URL or NEXT_PUBLIC_CONVEX_URL before running a non-dry-run import.");
  }

  const client = new ConvexHttpClient(convexUrl);
  const importSecret = process.env.KNOWLEDGE_IMPORT_SECRET || undefined;
  let chunksUpserted = 0;
  let sourcesUpserted = 0;

  for (const records of chunk(parsed.records, 200)) {
    const result = await client.mutation(convexFunctions.upsertImportedChunks, {
      importSecret,
      records,
    });
    chunksUpserted += result.chunksUpserted;
    sourcesUpserted += result.sourcesUpserted;
  }

  console.log(
    JSON.stringify(
      {
        mode: "import",
        file: filePath,
        batch: options.batch,
        knowledgeType: options.knowledgeType,
        sourcesUpserted,
        chunksUpserted,
        skipped: parsed.skipped,
      },
      null,
      2,
    ),
  );
}

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string | boolean>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      values.set("dry-run", true);
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      values.set(key, value);
      index += 1;
    }
  }

  const file = stringValue(values, "file") || "../output/chunks.jsonl";
  return {
    file,
    batch: stringValue(values, "batch") || "public-safe-v1",
    knowledgeType: knowledgeTypeValue(stringValue(values, "knowledge-type") || "insurance_policy"),
    dryRun: values.get("dry-run") === true,
  };
}

function stringValue(values: Map<string, string | boolean>, key: string): string {
  const value = values.get(key);
  return typeof value === "string" ? value : "";
}

function knowledgeTypeValue(value: string): KnowledgeType {
  if (value === "sop" || value === "insurance_policy" || value === "shop_doc" || value === "reference") {
    return value;
  }
  throw new Error("--knowledge-type must be one of: sop, insurance_policy, shop_doc, reference");
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
