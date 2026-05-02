import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Terminal Auto Body Knowledge Base",
  description: "Public-safe proof of concept for searching Terminal Auto Body knowledge-base documents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const body = publishableKey ? <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider> : children;

  return (
    <html lang="en">
      <body>{body}</body>
    </html>
  );
}
