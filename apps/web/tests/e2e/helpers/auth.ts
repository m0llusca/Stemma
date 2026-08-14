import type { BrowserContext } from "@playwright/test";
import { prisma } from "@/lib/db";
import { authJsSessionCookieName, createAuthSession, sessionCookieName } from "@/lib/auth/session";

const e2eBaseUrl = "http://localhost:3000";
const e2eSessionCookieNames = [authJsSessionCookieName, sessionCookieName] as const;

// Canonical demo-seed identity (prisma/demo-seed-bootstrap.ts + demo-seed-mutation.ts).
// The seed recreates this workspace/admin on every run; pinning by workspace id + email
// keeps sign-in deterministic even if a foreign workspace ever lands in the shared e2e
// database (a global `findFirst({ role: "ADMIN" })` lottery previously picked one up).
export const seededDemoWorkspaceId = "demo-workspace";
export const seededDemoAdminEmail = "admin@example.com";

export async function findSeededDemoAdmin() {
  return prisma.user.findFirstOrThrow({
    where: { email: seededDemoAdminEmail, role: "ADMIN", workspaceId: seededDemoWorkspaceId },
    select: { id: true, workspaceId: true }
  });
}

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
