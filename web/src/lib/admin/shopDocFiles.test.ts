import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  documentKeyFromFileName,
  extractCsvText,
  extractDocxText,
  extractSpreadsheetText,
  sourceRefForUploadedDocument,
} from "./shopDocFiles";

describe("uploaded shop document identity", () => {
  it("uses a stable filename-derived key for document refreshes", () => {
    expect(documentKeyFromFileName(" Paint SOP V2.docx ")).toBe("paint-sop-v2");
    expect(sourceRefForUploadedDocument("paint-sop-v2")).toBe("shop-doc-upload:paint-sop-v2");
  });
});

describe("extractCsvText", () => {
  it("turns CSV rows into searchable table text", () => {
    expect(extractCsvText(Buffer.from('"Step","Owner"\n"Inspect","Estimator"'))).toBe(
      ["Step | Owner", "Inspect | Estimator"].join("\n"),
    );
  });
});

describe("extractSpreadsheetText", () => {
  it("extracts worksheet rows from XLSX files", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Rates");
    sheet.addRow(["Operation", "Hours"]);
    sheet.addRow(["Pre repair scan", 0.3]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const text = await extractSpreadsheetText(buffer);

    expect(text).toContain("# Sheet: Rates");
    expect(text).toContain("Operation | Hours");
    expect(text).toContain("Pre repair scan | 0.3");
  });
});

describe("extractDocxText", () => {
  it("extracts paragraphs from Word documents", async () => {
    const buffer = await makeDocxBuffer(["Paint SOP", "Check primer before paint."]);

    await expect(extractDocxText(buffer)).resolves.toContain("Check primer before paint.");
  });
});

async function makeDocxBuffer(paragraphs: string[]) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`,
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`,
  );
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        ${paragraphs.map((text) => `<w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`).join("")}
      </w:body>
    </w:document>`,
  );

  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
