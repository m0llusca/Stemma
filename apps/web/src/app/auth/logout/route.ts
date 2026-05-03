import { NextRequest, NextResponse } from "next/server";
import { revokeAuthSession, sessionCookieName } from "@/lib/auth/session";
import { currentUserCookieName } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await revokeAuthSession(request.cookies.get(sessionCookieName)?.value);

  const response = NextResponse.redirect(new URL("/reviews", request.nextUrl.origin));
  response.cookies.set(sessionCookieName, "", { path: "/", maxAge: 0 });
  response.cookies.set(currentUserCookieName, "", { path: "/", maxAge: 0 });

  return response;
}

