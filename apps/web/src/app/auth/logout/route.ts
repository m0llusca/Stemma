import { NextRequest, NextResponse } from "next/server";
import { expiredCookieOptions } from "@/lib/auth/cookies";
import { revokeAuthSession, sessionCookieName } from "@/lib/auth/session";
import { currentUserCookieName } from "@/lib/current-user";

export const dynamic = "force-dynamic";

async function logout(request: NextRequest) {
  await revokeAuthSession(request.cookies.get(sessionCookieName)?.value);

  const response = NextResponse.redirect(new URL("/auth/login?loggedOut=1", request.nextUrl.origin), 303);
  response.cookies.set(sessionCookieName, "", expiredCookieOptions());
  response.cookies.set(currentUserCookieName, "", expiredCookieOptions());

  return response;
}

export async function GET(request: NextRequest) {
  return logout(request);
}

export async function POST(request: NextRequest) {
  return logout(request);
}
