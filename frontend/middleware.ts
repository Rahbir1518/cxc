import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/signIn(.*)",
  "/signUp(.*)",
  "/api/webhooks(.*)",
  "/navigate(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth();

  // If a signed-in user visits the landing page or auth pages, redirect to dashboard
  if (userId) {
    const path = request.nextUrl.pathname;
    if (path === "/" || path.startsWith("/signIn") || path.startsWith("/signUp")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Protect non-public routes (requires sign-in)
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
