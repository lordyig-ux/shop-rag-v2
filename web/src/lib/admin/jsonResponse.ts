export async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    if (response.ok) {
      return {} as T;
    }
    throw new Error(`${fallbackMessage}: ${response.status} ${response.statusText}`.trim());
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    if (looksLikeHtml(text)) {
      throw new Error(
        `${fallbackMessage}: the server returned an HTML page instead of JSON (${response.status} ${response.statusText}). ` +
          "Sign in again, then retry. If it still happens, check that the latest Vercel deployment finished and the API route exists.",
      );
    }

    throw new Error(`${fallbackMessage}: the server returned a non-JSON response (${response.status} ${response.statusText}).`);
  }
}

export function jsonResponseErrorMessage(body: unknown, fallbackMessage: string) {
  if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
    return body.error;
  }
  return fallbackMessage;
}

function looksLikeHtml(value: string) {
  return /^\s*<!doctype\s+html/i.test(value) || /^\s*<html[\s>]/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
