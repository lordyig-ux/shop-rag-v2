export type PdfTextPage = {
  pageNumber: number;
  text: string;
};

export type PdfTextParser = (data: Buffer) => Promise<{
  pages: PdfTextPage[];
  title: string;
}>;

export async function extractPdfTextPages(
  data: Buffer,
  parsers: PdfTextParser[] = [extractWithPdfParse, extractWithPdfjs],
) {
  const errors: string[] = [];

  for (const parser of parsers) {
    try {
      const result = await parser(data);
      if (hasPageText(result.pages)) {
        return result;
      }
      errors.push("Parser returned no text");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown PDF parser error");
    }
  }

  throw new Error(`PDF text extraction failed. ${errors.join("; ")}`);
}

async function extractWithPdfParse(data: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data });
  try {
    const infoResult = await parser.getInfo();
    const textResult = await parser.getText();
    const title = typeof infoResult.info?.Title === "string" ? infoResult.info.Title.trim() : "";
    return {
      pages: textResult.pages.map((page) => ({ pageNumber: page.num, text: page.text })),
      title,
    };
  } finally {
    await parser.destroy();
  }
}

async function extractWithPdfjs(data: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  });
  const document = await loadingTask.promise;

  try {
    const pages: PdfTextPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
        .filter(Boolean)
        .join("\n");
      pages.push({ pageNumber, text });
    }

    const metadata = await document.getMetadata().catch(() => null);
    const info = metadata && "info" in metadata ? metadata.info : null;
    const title = isRecord(info) && typeof info.Title === "string" ? info.Title.trim() : "";
    return { pages, title };
  } finally {
    await document.destroy();
  }
}

function hasPageText(pages: PdfTextPage[]) {
  return pages.some((page) => page.text.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
