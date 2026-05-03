import { describe, expect, it } from "vitest";

import { ensurePdfNodeGlobals, extractPdfTextPages, type PdfTextParser } from "./pdfText";

describe("extractPdfTextPages", () => {
  it("uses a fallback parser when the primary PDF parser fails", async () => {
    const primary: PdfTextParser = async () => {
      throw new Error("primary parser failed");
    };
    const fallback: PdfTextParser = async () => ({
      pages: [{ pageNumber: 1, text: "Collision Repair program guide" }],
      title: "Collision Repair Program Guide",
    });

    await expect(extractPdfTextPages(Buffer.from("%PDF-1.6"), [primary, fallback])).resolves.toEqual({
      pages: [{ pageNumber: 1, text: "Collision Repair program guide" }],
      title: "Collision Repair Program Guide",
    });
  });

  it("reports parser failures when every parser fails or extracts no text", async () => {
    const throwingParser: PdfTextParser = async () => {
      throw new Error("worker missing");
    };
    const emptyParser: PdfTextParser = async () => ({ pages: [], title: "" });

    await expect(extractPdfTextPages(Buffer.from("%PDF-1.6"), [throwingParser, emptyParser])).rejects.toThrow(
      "PDF text extraction failed. worker missing; Parser returned no text",
    );
  });
});

describe("ensurePdfNodeGlobals", () => {
  it("installs DOMMatrix for PDF parsing in Node runtimes", async () => {
    const originalDomMatrix = globalThis.DOMMatrix;

    try {
      Reflect.deleteProperty(globalThis, "DOMMatrix");

      await ensurePdfNodeGlobals();

      expect(globalThis.DOMMatrix).toBeDefined();
    } finally {
      if (originalDomMatrix) {
        globalThis.DOMMatrix = originalDomMatrix;
      } else {
        Reflect.deleteProperty(globalThis, "DOMMatrix");
      }
    }
  });
});
