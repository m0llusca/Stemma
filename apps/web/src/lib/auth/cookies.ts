import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function authCookieOptions(maxAge: number): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge
  };
}

export function oidcFlowCookieOptions(): Partial<ResponseCookie> {
  return authCookieOptions(60 * 10);
}

export function expiredCookieOptions(): Partial<ResponseCookie> {
  return {
    path: "/",
    maxAge: 0
  };
}
