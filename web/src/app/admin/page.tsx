import { redirect } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { SetupShell } from "@/components/SetupShell";
import { isValidAdminBypassToken } from "@/lib/auth/adminBypass";
import { ADMIN_BYPASS_QUERY_PARAM } from "@/lib/auth/adminBypassConstants";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const params = searchParams ? await searchParams : {};
  const requestedBypassToken = firstParam(params[ADMIN_BYPASS_QUERY_PARAM]);
  const adminBypassToken = isValidAdminBypassToken(requestedBypassToken) ? requestedBypassToken : "";

  if (!convexUrl) {
    return <SetupShell />;
  }

  const access = await requireAdminAccess({ bypassToken: adminBypassToken });
  if (!access.ok) {
    redirect(access.status === 401 ? "/" : "/unauthorized");
  }

  return (
    <ConvexClientProvider convexUrl={convexUrl}>
      <AdminShell adminBypassToken={adminBypassToken} />
    </ConvexClientProvider>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
