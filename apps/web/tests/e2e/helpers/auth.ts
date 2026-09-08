import type { BrowserContext, Page } from "@playwright/test";
import { hashLocalPassword } from "@/lib/auth/local-credentials";
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

export const seededDemoAnalystEmail = "qa@example.com";
export const seededDemoLeadEmail = "lead@example.com";
export const seededDemoAgentEmail = "ivan@example.com";
export const seededDemoExecEmail = "exec@example.com";
export const seededDemoViewerEmail = "viewer@example.com";

export const localQaAdmin = {
  email: "local.admin@example.com",
  login: "local.admin",
  name: "Локальный админ",
  password: "LocalPassw0rd1"
} as const;

export async function findSeededDemoAnalyst() {
  return prisma.user.findFirstOrThrow({
    where: { email: seededDemoAnalystEmail, role: "QA_ANALYST", workspaceId: seededDemoWorkspaceId },
    select: { id: true, workspaceId: true, name: true }
  });
}

export async function findSeededDemoLead() {
  return prisma.user.findFirstOrThrow({
    where: { email: seededDemoLeadEmail, role: "TEAM_LEAD", workspaceId: seededDemoWorkspaceId },
    select: { id: true, workspaceId: true, name: true }
  });
}

export async function findSeededDemoAgent() {
  return prisma.user.findFirstOrThrow({
    where: { email: seededDemoAgentEmail, role: "SUPPORT_AGENT", workspaceId: seededDemoWorkspaceId },
    select: { id: true, workspaceId: true, name: true }
  });
}

export async function findSeededDemoViewer() {
  return prisma.user.findFirstOrThrow({
    where: { email: seededDemoViewerEmail, role: "VIEWER", workspaceId: seededDemoWorkspaceId },
    select: { id: true, workspaceId: true, name: true, email: true }
  });
}

export async function findSeededDemoExec() {
  return prisma.user.findFirstOrThrow({
    where: { email: seededDemoExecEmail, role: "EXEC", workspaceId: seededDemoWorkspaceId },
    select: { id: true, workspaceId: true, name: true }
  });
}

/** Local admin with password login and no DEMO identity — can persist settings. */
export async function createLocalNonDemoAdmin() {
  const passwordData = await hashLocalPassword(localQaAdmin.password);

  return prisma.user.create({
    data: {
      workspaceId: seededDemoWorkspaceId,
      email: localQaAdmin.email,
      name: localQaAdmin.name,
      role: "ADMIN",
      localCredential: {
        create: {
          workspaceId: seededDemoWorkspaceId,
          login: localQaAdmin.login,
          passwordHash: passwordData.passwordHash,
          passwordSalt: passwordData.passwordSalt,
          keyVersion: passwordData.keyVersion
        }
      }
    },
    select: { id: true, workspaceId: true, email: true, name: true }
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

/** QC_DEMO_AUTH only: account/profile menu → one menuitem. Lands on that role's home. */
export async function switchSeededDemoRole(page: Page, optionLabel: string | RegExp) {
  await page.locator('[data-slot="account-menu"]').click();
  await page.getByRole("menuitem", { name: optionLabel }).click();
}
