import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import { isValidAdminBypassToken } from "@/lib/auth/adminBypass";
import { ADMIN_BYPASS_QUERY_PARAM } from "@/lib/auth/adminBypassConstants";

const isProtectedRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return;
  }

  if (isProtectedRoute(request)) {
    if (isValidAdminBypassToken(request.nextUrl.searchParams.get(ADMIN_BYPASS_QUERY_PARAM))) {
      return;
    }

    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
