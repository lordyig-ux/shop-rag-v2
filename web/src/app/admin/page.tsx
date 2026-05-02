import { redirect } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { SetupShell } from "@/components/SetupShell";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    return <SetupShell />;
  }

  const access = await requireAdminAccess();
  if (!access.ok) {
    redirect(access.status === 401 ? "/" : "/unauthorized");
  }

  return (
    <ConvexClientProvider convexUrl={convexUrl}>
      <AdminShell />
    </ConvexClientProvider>
  );
}
