import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { homeForRole } from "@/lib/session";

const ROLE_PREFIX: Record<string, "ADMIN" | "INSTALLER" | "CUSTOMER"> = {
  "/admin": "ADMIN",
  "/installer": "INSTALLER",
  "/customer": "CUSTOMER",
};

// Optimistic check only — every server component/action re-verifies the
// session and scopes data by ownership. See lib/session.ts.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const protectedPrefix = Object.keys(ROLE_PREFIX).find((prefix) =>
    pathname.startsWith(prefix)
  );

  if (protectedPrefix) {
    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (session.role !== ROLE_PREFIX[protectedPrefix]) {
      return NextResponse.redirect(new URL(homeForRole(session.role), request.url));
    }
  }

  if ((pathname === "/login" || pathname === "/register") && session) {
    return NextResponse.redirect(new URL(homeForRole(session.role), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/installer/:path*", "/customer/:path*", "/login", "/register"],
};
