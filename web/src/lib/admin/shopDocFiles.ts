import ExcelJS from "exceljs";
import mammoth from "mammoth";

export type UploadedShopDocKind = "csv" | "docx" | "html" | "markdown" | "pdf" | "text" | "xlsx";

export function documentKeyFromFileName(fileName: string) {
  const withoutPath = fileName.trim().split(/[\\/]/).pop() || "shop-document";
  const withoutExtension = withoutPath.replace(/\.[a-z0-9]+$/i, "");
  const slug = withoutExtension
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "shop-document";
}

export function sourceRefForUploadedDocument(documentKey: string) {
  return `shop-doc-upload:${documentKeyFromFileName(documentKey)}`;
}

export function titleFromUploadedFileName(fileName: string) {
  const withoutPath = fileName.trim().split(/[\\/]/).pop() || "Shop document";
  const withoutExtension = withoutPath.replace(/\.[a-z0-9]+$/i, "");
  return withoutExtension.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Shop document";
}

export function detectUploadedShopDocKind(fileName: string, contentType = ""): UploadedShopDocKind | null {
  const lowerName = fileName.toLowerCase();
  const lowerType = contentType.toLowerCase();

  if (lowerName.endsWith(".pdf") || lowerType.includes("application/pdf")) return "pdf";
  if (lowerName.endsWith(".docx") || lowerType.includes("wordprocessingml.document")) return "docx";
  if (lowerName.endsWith(".xlsx") || lowerType.includes("spreadsheetml.sheet")) return "xlsx";
  if (lowerName.endsWith(".csv") || lowerType.includes("text/csv")) return "csv";
  if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown")) return "markdown";
  if (lowerName.endsWith(".html") || lowerName.endsWith(".htm") || lowerType.includes("text/html")) return "html";
  if (lowerName.endsWith(".txt") || lowerType.includes("text/plain")) return "text";

  return null;
}

export async function extractDocxText(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return normalizeExtractedText(result.value);
}

export async function extractSpreadsheetText(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheets: string[] = [];
  workbook.eachSheet((worksheet) => {
    const rows: string[] = [];
    worksheet.eachRow((row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = excelCellValueToText(cell.value);
        if (value) {
          values.push(value);
        }
      });

      if (values.length) {
        rows.push(values.join(" | "));
      }
    });

    if (rows.length) {
      sheets.push([`# Sheet: ${worksheet.name}`, ...rows].join("\n"));
    }
  });

  return normalizeExtractedText(sheets.join("\n\n"));
}

export function extractCsvText(buffer: Buffer) {
  const rows = parseCsv(buffer.toString("utf8"));
  return normalizeExtractedText(rows.map((row) => row.map((cell) => cell.trim()).filter(Boolean).join(" | ")).filter(Boolean).join("\n"));
}

export function extractTextFile(buffer: Buffer) {
  return normalizeExtractedText(buffer.toString("utf8"));
}

function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((cells) => cells.some((value) => value.trim()));
}

function excelCellValueToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);

  if ("text" in value && typeof value.text === "string") return value.text;
  if ("result" in value) return excelCellValueToText(value.result as ExcelJS.CellValue);
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((entry) => entry.text).join("");
  }
  if ("hyperlink" in value && typeof value.hyperlink === "string") {
    return "text" in value && typeof value.text === "string" ? `${value.text} (${value.hyperlink})` : value.hyperlink;
  }

  return "";
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
