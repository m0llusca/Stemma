import type { BrowserContext } from "@playwright/test";
import { authJsSessionCookieName, createAuthSession, sessionCookieName } from "@/lib/auth/session";

const e2eBaseUrl = "http://localhost:3000";
const e2eSessionCookieNames = [authJsSessionCookieName, sessionCookieName] as const;

export async function signInE2EUser(context: BrowserContext, user: { id: string }, userAgent: string) {
  const { token, session } = await createAuthSession({
    userId: user.id,
    userAgent
  });

  const cookieOptions = {
    value: token,
    url: e2eBaseUrl,
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: false,
    expires: Math.floor(session.expiresAt.getTime() / 1000)
  };

  await context.addCookies(e2eSessionCookieNames.map((name) => ({ name, ...cookieOptions })));

  return { token, session };
}
