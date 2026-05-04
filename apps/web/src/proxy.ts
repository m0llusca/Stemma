import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = "qc_session";

function isDemoAuthEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.QC_DEMO_AUTH === "enabled";
}

function isAuthPath(pathname: string) {
  return pathname === "/auth" || pathname.startsWith("/auth/");
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

  if (request.cookies.get(sessionCookieName)?.value) {
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
