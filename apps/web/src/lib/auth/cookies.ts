export type AuthCookieOptions = {
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
  path?: string;
  maxAge?: number;
};

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function authCookieOptions(maxAge: number): AuthCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge
  };
}

export function oidcFlowCookieOptions(): AuthCookieOptions {
  return authCookieOptions(60 * 10);
}

export function demoUserCookieOptions(maxAge: number): AuthCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge
  };
}

export function expiredCookieOptions(): AuthCookieOptions {
  return {
    path: "/",
    maxAge: 0
  };
}
