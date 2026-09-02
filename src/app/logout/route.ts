import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("reason");
  const loginUrl = new URL("/login", request.url);
  if (reason) loginUrl.searchParams.set("reason", reason);

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
