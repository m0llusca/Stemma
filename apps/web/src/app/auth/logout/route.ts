import { NextRequest, NextResponse } from "next/server";
import { expiredCookieOptions } from "@/lib/auth/cookies";
import { loginFlashCookieName } from "@/lib/auth/login-flash";
import { authJsSessionCookieNames, revokeAuthSession, sessionCookieName } from "@/lib/auth/session";
import { currentUserCookieName } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const authJsSessionTokenCookieNames = authJsSessionCookieNames.filter((cookieName) => cookieName.endsWith("session-token"));

function sessionTokensFromRequest(request: NextRequest) {
  const cookieTokens = [
    request.cookies.get(sessionCookieName)?.value,
    ...authJsSessionTokenCookieNames.map((cookieName) => request.cookies.get(cookieName)?.value)
  ];

  return Array.from(new Set(cookieTokens.filter((token): token is string => Boolean(token))));
}

async function logout(request: NextRequest) {
  await Promise.all(sessionTokensFromRequest(request).map((token) => revokeAuthSession(token)));

  const response = NextResponse.redirect(new URL("/auth/login?loggedOut=1", request.nextUrl.origin), 303);
  response.cookies.set(sessionCookieName, "", expiredCookieOptions());
  for (const cookieName of authJsSessionCookieNames) {
    response.cookies.set(cookieName, "", expiredCookieOptions());
  }
  response.cookies.set(loginFlashCookieName, "", expiredCookieOptions());
  response.cookies.set(currentUserCookieName, "", expiredCookieOptions());

  return response;
}

export async function GET(request: NextRequest) {
  return logout(request);
}

export async function POST(request: NextRequest) {
  return logout(request);
}
