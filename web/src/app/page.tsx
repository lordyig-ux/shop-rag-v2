import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { SearchShell } from "@/components/SearchShell";
import { SetupShell } from "@/components/SetupShell";

export default function Home() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    return <SetupShell />;
  }

  return (
    <ConvexClientProvider convexUrl={convexUrl}>
      <SearchShell />
    </ConvexClientProvider>
  );
}
