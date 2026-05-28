import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = "qc_session";
const migrationSessionCookieNames = [
  sessionCookieName,
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token"
] as const;

function isDemoAuthEnabled() {
  return process.env.QC_DEMO_AUTH === "enabled";
}

function isAuthPath(pathname: string) {
  return pathname === "/auth" || pathname.startsWith("/auth/");
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
    return NextResponse.next();
  }

  if (hasMigrationSessionCookie(request)) {
    return NextResponse.next();
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
