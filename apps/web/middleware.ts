import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function getCorsOrigin(): string {
  return process.env.MOBILE_CORS_ORIGIN ?? "*";
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip i18n for all API routes
  if (pathname.startsWith("/api")) {
    // Handle CORS when an Origin header is present
    if (req.headers.has("Origin")) {
      const origin = getCorsOrigin();

      // Preflight
      if (req.method === "OPTIONS") {
        return new NextResponse(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": origin,
            ...CORS_HEADERS,
          },
        });
      }

      // Add CORS headers to response
      const response = NextResponse.next();
      response.headers.set("Access-Control-Allow-Origin", origin);
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        response.headers.set(key, value);
      }
      return response;
    }

    // No Origin header — just pass through without i18n
    return NextResponse.next();
  }

  // i18n middleware for non-API routes
  return intlMiddleware(req);
}

export const config = {
  matcher: [
    // Match API routes for CORS handling
    "/api/:path*",
    // Match all non-API/non-static routes for i18n
    "/((?!_next|_vercel|.*\\..*).*)",
  ],
};
