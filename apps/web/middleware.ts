import { NextRequest, NextResponse } from "next/server";

const TOKEN_KEY = "stairdoc_token";

/**
 * Routes that anyone can access without a token.
 */
const PUBLIC_PATHS = new Set(["/auth"]);

/**
 * Role → allowed path prefixes.
 *
 * Any path not listed under a role is blocked for that role.
 * `/auth` is always public.  `/` (overview) is accessible to everyone
 * who is authenticated.
 */
const ROLE_ROUTES: Record<string, string[]> = {
  operator: [
    "/",
    "/dashboard",
    "/deliveries",
    "/rfid",
    "/camera",
    "/navigation",
    "/settings",
  ],
  recipient: ["/", "/deliveries", "/rfid", "/camera"],
  admin: [
    "/",
    "/dashboard",
    "/deliveries",
    "/rfid",
    "/camera",
    "/navigation",
    "/settings",
    "/admin",
  ],
};

/**
 * Decode the JWT payload without validating the signature.
 * (Middleware runs on the Edge – we only need the role for routing.)
 */
function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]!));
    // Very basic expiry check
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Always allow public paths
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // 2. Always allow static / _next / api routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 3. Read token from cookie (set by the auth client)
  const token = request.cookies.get(TOKEN_KEY)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  const payload = decodePayload(token);
  if (!payload) {
    // Expired or malformed – send to auth
    const response = NextResponse.redirect(new URL("/auth", request.url));
    response.cookies.delete(TOKEN_KEY);
    return response;
  }

  const role = payload.role as string;

  // 4. Check role-based access
  const allowed = ROLE_ROUTES[role];
  if (!allowed) {
    // Unknown role – redirect to auth
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  // Match the current pathname against allowed prefixes.
  // Exact match for "/" ; prefix match for others.
  const isAllowed = allowed.some((route) => {
    if (route === "/") return pathname === "/";
    return pathname === route || pathname.startsWith(`${route}/`);
  });

  if (!isAllowed) {
    // Redirect to dashboard home instead of showing 403
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and Next internals.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|icons|logos|sw\\.js).*)",
  ],
};
