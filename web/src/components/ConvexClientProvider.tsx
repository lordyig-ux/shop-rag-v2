"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useState } from "react";

export function ConvexClientProvider({
  children,
  convexUrl,
}: {
  children: React.ReactNode;
  convexUrl: string;
}) {
  const [client] = useState(() => new ConvexReactClient(convexUrl));
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
