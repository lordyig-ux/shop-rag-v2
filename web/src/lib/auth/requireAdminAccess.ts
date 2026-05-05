import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { headers } from "next/headers";

import { isValidAdminBypassToken } from "./adminBypass";
import { ADMIN_BYPASS_HEADER } from "./adminBypassConstants";
import { isAllowedAdminEmail } from "./adminAccess";
import { isClerkConfigured } from "./clerkConfig";
import { getPrimaryEmailFromClerkUser } from "./clerkUserEmail";

export type AdminAccessResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403; message: string };

export async function requireAdminAccess(options: { bypassToken?: string | null } = {}): Promise<AdminAccessResult> {
  const bypassToken = options.bypassToken || (await requestAdminBypassToken());
  if (isValidAdminBypassToken(bypassToken)) {
    return { ok: true, email: "admin-bypass-token" };
  }

  if (!isClerkConfigured()) {
    return { ok: true, email: "" };
  }

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, status: 401, message: "Admin sign-in required" };
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = getPrimaryEmailFromClerkUser(user);

  if (!isAllowedAdminEmail(email)) {
    return { ok: false, status: 403, message: "Admin email domain required" };
  }

  return { ok: true, email };
}

export function adminAccessErrorResponse(result: Extract<AdminAccessResult, { ok: false }>) {
  return Response.json({ error: result.message }, { status: result.status });
}

async function requestAdminBypassToken() {
  try {
    const requestHeaders = await headers();
    return requestHeaders.get(ADMIN_BYPASS_HEADER);
  } catch {
    return null;
  }
}
