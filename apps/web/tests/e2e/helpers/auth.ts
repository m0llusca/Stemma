import type { BrowserContext } from "@playwright/test";
import { createAuthSession, sessionCookieName } from "@/lib/auth/session";

const e2eBaseUrl = "http://localhost:3000";

export async function signInE2EUser(context: BrowserContext, user: { id: string }, userAgent: string) {
  const { token, session } = await createAuthSession({
    userId: user.id,
    userAgent
  });

  await context.addCookies([
    {
      name: sessionCookieName,
      value: token,
      url: e2eBaseUrl,
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
      expires: Math.floor(session.expiresAt.getTime() / 1000)
    }
  ]);

  return { token, session };
}
