import { AdminShell } from "@/components/AdminShell";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { SetupShell } from "@/components/SetupShell";

export default function AdminPage() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    return <SetupShell />;
  }

  return (
    <ConvexClientProvider convexUrl={convexUrl}>
      <AdminShell />
    </ConvexClientProvider>
  );
}
