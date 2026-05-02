import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { SetupShell } from "@/components/SetupShell";
import { isAllowedAdminEmail } from "@/lib/auth/adminAccess";
import { isClerkConfigured } from "@/lib/auth/clerkConfig";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    return <SetupShell />;
  }

  if (isClerkConfigured()) {
    const user = await currentUser();
    const email =
      user?.primaryEmailAddress?.emailAddress || user?.emailAddresses.find((address) => address.emailAddress)?.emailAddress || "";

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
