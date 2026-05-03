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
  await ensurePdfNodeGlobals();

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

export async function ensurePdfNodeGlobals() {
  const globalScope = globalThis as typeof globalThis & {
    DOMMatrix?: typeof DOMMatrix;
    pdfjsWorker?: unknown;
  };

  globalScope.DOMMatrix ||= SimpleDOMMatrix as unknown as typeof DOMMatrix;
  globalScope.pdfjsWorker ||= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
}

class SimpleDOMMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;

  constructor(init?: number[] | string) {
    if (Array.isArray(init)) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = [
        init[0] ?? 1,
        init[1] ?? 0,
        init[2] ?? 0,
        init[3] ?? 1,
        init[4] ?? 0,
        init[5] ?? 0,
      ];
      return;
    }

    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.e = 0;
    this.f = 0;
  }

  translate(tx = 0, ty = 0) {
    return new SimpleDOMMatrix([this.a, this.b, this.c, this.d, this.e + tx, this.f + ty]);
  }

  scale(scaleX = 1, scaleY = scaleX) {
    return new SimpleDOMMatrix([this.a * scaleX, this.b * scaleX, this.c * scaleY, this.d * scaleY, this.e, this.f]);
  }

  multiplySelf(other: SimpleDOMMatrix) {
    const next = this.multiply(other);
    this.a = next.a;
    this.b = next.b;
    this.c = next.c;
    this.d = next.d;
    this.e = next.e;
    this.f = next.f;
    return this;
  }

  preMultiplySelf(other: SimpleDOMMatrix) {
    const next = other.multiply(this);
    this.a = next.a;
    this.b = next.b;
    this.c = next.c;
    this.d = next.d;
    this.e = next.e;
    this.f = next.f;
    return this;
  }

  invertSelf() {
    const determinant = this.a * this.d - this.b * this.c;
    if (!determinant) {
      this.a = Number.NaN;
      this.b = Number.NaN;
      this.c = Number.NaN;
      this.d = Number.NaN;
      this.e = Number.NaN;
      this.f = Number.NaN;
      return this;
    }

    const { a, b, c, d, e, f } = this;
    this.a = d / determinant;
    this.b = -b / determinant;
    this.c = -c / determinant;
    this.d = a / determinant;
    this.e = (c * f - d * e) / determinant;
    this.f = (b * e - a * f) / determinant;
    return this;
  }

  private multiply(other: SimpleDOMMatrix) {
    return new SimpleDOMMatrix([
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.e + this.c * other.f + this.e,
      this.b * other.e + this.d * other.f + this.f,
    ]);
  }
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
