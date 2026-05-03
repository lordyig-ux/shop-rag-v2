import { describe, expect, it } from "vitest";

import { jsonResponseErrorMessage, readJsonResponse } from "./jsonResponse";

describe("readJsonResponse", () => {
  it("parses JSON responses", async () => {
    const result = await readJsonResponse<{ ok: boolean }>(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
      "Shop Docs import failed",
    );

    expect(result).toEqual({ ok: true });
  });

  it("reports HTML responses as route/auth/deployment failures", async () => {
    await expect(
      readJsonResponse(
        new Response("<!DOCTYPE html><title>404</title>", {
          headers: { "content-type": "text/html" },
          status: 404,
          statusText: "Not Found",
        }),
        "Shop Docs import failed",
      ),
    ).rejects.toThrow(
      "Shop Docs import failed: the server returned an HTML page instead of JSON (404 Not Found). Sign in again, then retry. If it still happens, check that the latest Vercel deployment finished and the API route exists.",
    );
  });
});

describe("jsonResponseErrorMessage", () => {
  it("uses a JSON error message when one exists", () => {
    expect(jsonResponseErrorMessage({ error: "KNOWLEDGE_IMPORT_SECRET is not configured." }, "Import failed")).toBe(
      "KNOWLEDGE_IMPORT_SECRET is not configured.",
    );
  });

  it("falls back when the JSON body has no error message", () => {
    expect(jsonResponseErrorMessage({ ok: false }, "Import failed")).toBe("Import failed");
  });
});
