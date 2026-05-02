import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { SetupShell } from "@/components/SetupShell";
import { isAllowedAdminEmail } from "@/lib/auth/adminAccess";
import { isClerkConfigured } from "@/lib/auth/clerkConfig";
import { getPrimaryEmailFromClerkUser } from "@/lib/auth/clerkUserEmail";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    return <SetupShell />;
  }

  if (isClerkConfigured()) {
    const { userId } = await auth();
    if (!userId) {
      redirect("/");
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email = getPrimaryEmailFromClerkUser(user);

    if (!isAllowedAdminEmail(email)) {
      redirect("/unauthorized");
    }
  }

  return (
    <ConvexClientProvider convexUrl={convexUrl}>
      <AdminShell />
    </ConvexClientProvider>
  );
}
