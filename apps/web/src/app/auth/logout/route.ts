import { NextRequest, NextResponse } from "next/server";
import { expiredCookieOptions } from "@/lib/auth/cookies";
import { loginFlashCookieName } from "@/lib/auth/login-flash";
import { resolveLogoutLocation } from "@/lib/auth/logout-location";
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

/**
 * Next Link / router prefetch must not revoke the session. The proxy matcher
 * already skips prefetch, so a `<Link href="/auth/logout">` hits this route
 * and used to 303-logout on hover.
 */
function isLogoutPrefetch(request: NextRequest) {
  const purpose = `${request.headers.get("purpose") ?? ""} ${request.headers.get("sec-purpose") ?? ""}`.toLowerCase();
  return request.headers.has("next-router-prefetch") || purpose.includes("prefetch");
}

function clearAuthCookies(response: NextResponse) {
  response.cookies.set(sessionCookieName, "", expiredCookieOptions());
  for (const cookieName of authJsSessionCookieNames) {
    response.cookies.set(cookieName, "", expiredCookieOptions());
  }
  response.cookies.set(loginFlashCookieName, "", expiredCookieOptions());
  response.cookies.set(currentUserCookieName, "", expiredCookieOptions());
}

/**
 * Never redirect to the Next bind host (`https://0.0.0.0:3000/...`).
 * Public Host / x-forwarded-host / AUTH_URL first; relative path last.
 */
function loggedOutRedirect(request: NextRequest) {
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: resolveLogoutLocation(request.headers, request.nextUrl),
      "Cache-Control": "no-store"
    }
  });
  clearAuthCookies(response);
  return response;
}

async function logout(request: NextRequest) {
  await Promise.all(sessionTokensFromRequest(request).map((token) => revokeAuthSession(token)));
  return loggedOutRedirect(request);
}

export async function GET(request: NextRequest) {
  if (isLogoutPrefetch(request)) {
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" }
    });
  }

  return logout(request);
}

export async function POST(request: NextRequest) {
  return logout(request);
}
