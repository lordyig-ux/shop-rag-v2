import { put } from "@vercel/blob";

type UploadSourceFileInput = {
  batchId: string;
  contentType: string;
  data: Buffer;
  documentKey: string;
  fileName: string;
};

export async function uploadShopDocSourceFile(input: UploadSourceFileInput) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured in Vercel.");
  }

  const blob = await put(
    shopDocSourceBlobPathname({
      batchId: input.batchId,
      documentKey: input.documentKey,
      fileName: input.fileName,
    }),
    new Blob([new Uint8Array(input.data)], { type: input.contentType || undefined }),
    {
      access: "public",
      contentType: input.contentType || undefined,
    },
  );

  return blob.url;
}

export function shopDocSourceBlobPathname({
  batchId,
  documentKey,
  fileName,
}: {
  batchId: string;
  documentKey: string;
  fileName: string;
}) {
  return ["shop-docs", safePathPart(documentKey || "shop-document"), `${safePathPart(batchId)}-${safeFileName(fileName)}`].join("/");
}

function safeFileName(fileName: string) {
  const name = fileName.trim().split(/[\\/]/).pop() || "source-file";
  const extension = name.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() || "";
  const baseName = extension ? name.slice(0, -extension.length) : name;
  return `${safePathPart(baseName || "source-file")}${extension}`;
}

function safePathPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "file";
}
