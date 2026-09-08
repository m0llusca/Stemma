import { NextResponse, type NextRequest } from "next/server";
import { AUTH_PATHNAME_HEADER, isAuthPath } from "@/lib/auth/auth-path";
import { isDemoAuthEnabled } from "@/lib/auth/demo";

// Дублирует имена session-кук из src/lib/auth/session.ts (sessionCookieName,
// authJsSessionCookieNames): импортировать оттуда нельзя — модуль тянет prisma
// и недоступен в edge runtime middleware. При изменении списка правьте оба места.
const sessionCookieName = "qc_session";
const migrationSessionCookieNames = [
  sessionCookieName,
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token"
] as const;

function nextWithPathname(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(AUTH_PATHNAME_HEADER, request.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders }
  });
}

function hasMigrationSessionCookie(request: NextRequest) {
  // Optimistic shell routing only; getCurrentUser() and permission guards remain authoritative.
  return migrationSessionCookieNames.some((cookieName) => Boolean(request.cookies.get(cookieName)?.value));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    isDemoAuthEnabled() ||
    isAuthPath(pathname) ||
    (request.method !== "GET" && request.method !== "HEAD")
  ) {
    return nextWithPathname(request);
  }

  if (hasMigrationSessionCookie(request)) {
    // Cookie presence is not session validity. An expired/forged cookie still
    // reaches the page; requirePagePermission / requirePageUser map
    // AuthRequiredError to unauthorized() — not generic error.tsx.
    return nextWithPathname(request);
  }

  const loginUrl = new URL("/auth/login", request.url);
  loginUrl.searchParams.set("returnTo", `${pathname}${search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};
