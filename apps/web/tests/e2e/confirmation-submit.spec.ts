import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Request } from "@playwright/test";
import { hashLocalPassword } from "@/lib/auth/local-credentials";
import { prisma } from "@/lib/db";
import { resolvePlaywrightTestDatabaseUrl } from "../../playwright-database-guard";
import { seededDemoWorkspaceId, signInE2EUser } from "./helpers/auth";

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

const actorIdentity = {
  id: "e2e-confirmation-submit-admin",
  email: "confirmation-submit.e2e@example.invalid",
  name: "E2E подтверждение отправки",
  login: "e2e.confirmation-submit"
} as const;

function assertVerifyDatabase() {
  const expected = resolvePlaywrightTestDatabaseUrl({ ...process.env, QC_PLAYWRIGHT_DATABASE_NAME: "qc_app_demo_verify" });
  const actual = resolvePlaywrightTestDatabaseUrl({
    ...process.env,
    QC_PLAYWRIGHT_DATABASE_NAME: "qc_app_demo_verify",
    TEST_DATABASE_URL: process.env.DATABASE_URL
  });
  expect(actual === expected, "the browser server and fixture client must use the same dedicated verify database").toBe(true);
}

async function findOrCreateConfirmationAdmin() {
  const password = await hashLocalPassword(`E2e-${randomUUID()}`);
  const actor = await prisma.user.upsert({
    where: { id: actorIdentity.id },
    update: {},
    create: {
      id: actorIdentity.id,
      workspaceId: seededDemoWorkspaceId,
      email: actorIdentity.email,
      name: actorIdentity.name,
      role: "ADMIN",
      localCredential: {
        create: {
          workspaceId: seededDemoWorkspaceId,
          login: actorIdentity.login,
          ...password
        }
      }
    },
    select: {
      id: true, workspaceId: true, email: true, name: true, role: true, lifecycleStatus: true,
      localCredential: { select: { login: true } },
      externalIdentities: { select: { provider: { select: { type: true } } } }
    }
  });
  expect(actor).toMatchObject({
    id: actorIdentity.id,
    workspaceId: seededDemoWorkspaceId,
    email: actorIdentity.email,
    name: actorIdentity.name,
    role: "ADMIN",
    lifecycleStatus: "ACTIVE",
    localCredential: { login: actorIdentity.login }
  });
  expect(actor.externalIdentities.some((identity) => identity.provider.type === "DEMO")).toBe(false);
  return actor;
}

test("confirmation cancels safely and submits one real token-revocation server action", async ({ page, context }) => {
  // Recheck BOTH URLs before any fixture write, even though config guards boot.
  assertVerifyDatabase();
  const tokenId = `e2e-confirmation-submit-${randomUUID()}`;
  const tokenName = `E2E подтверждение ${tokenId}`;
  let sessionId: string | undefined;
  let actionPosts = 0;
  let onlyNextActions = true;
  const trackAction = (request: Request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/admin/tokens") {
      actionPosts += 1;
      onlyNextActions &&= Boolean(request.headers()["next-action"]);
    }
  };
  const auditWhere = {
    workspaceId: seededDemoWorkspaceId,
    actorId: actorIdentity.id,
    action: "api_token.revoked",
    targetType: "api_token",
    targetId: tokenId
  };

  try {
    const actor = await findOrCreateConfirmationAdmin();
    const signedIn = await signInE2EUser(context, actor, "playwright-confirmation-submit");
    sessionId = signedIn.session.id;
    await prisma.apiToken.create({
      data: {
        id: tokenId,
        workspaceId: seededDemoWorkspaceId,
        name: tokenName,
        tokenPrefix: "e2e_fake...",
        tokenHash: createHash("sha256").update(`fake-opaque-${randomUUID()}`).digest("hex"),
        scopes: "conversations:read"
      }
    });

    page.on("request", trackAction);
    await page.goto("/admin/tokens");
    const row = page.getByRole("row").filter({ has: page.getByText(tokenName, { exact: true }) });
    await expect(row).toHaveCount(1);
    const revoke = row.getByRole("button", { name: `Отозвать ключ ${tokenName}`, exact: true });
    await expect(revoke).toBeEnabled();

    await revoke.click();
    let confirmation = page.getByRole("alertdialog", { name: "Подтвердите действие", exact: true });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(`Отозвать ключ «${tokenName}»?`);
    await confirmation.getByRole("button", { name: "Отмена", exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(revoke).toBeFocused();
    expect(actionPosts, "cancel must not send the original form").toBe(0);
    expect(await prisma.apiToken.findUniqueOrThrow({
      where: { id: tokenId },
      select: { expiresAt: true, lastError: true, lastErrorAt: true }
    })).toEqual({ expiresAt: null, lastError: null, lastErrorAt: null });
    expect(await prisma.auditLog.count({ where: auditWhere })).toBe(0);

    await revoke.click();
    confirmation = page.getByRole("alertdialog", { name: "Подтвердите действие", exact: true });
    await expect(confirmation).toBeVisible();
    const [response] = await Promise.all([
      page.waitForResponse((result) => result.request().method() === "POST" && new URL(result.url()).pathname === "/admin/tokens"),
      confirmation.getByRole("button", { name: "Подтвердить", exact: true }).click()
    ]);
    expect(response.ok(), "the real Next server action must complete successfully").toBe(true);
    await response.finished();
    await expect(confirmation).toBeHidden();
    await expect(revoke).toBeDisabled();

    // ApiToken revocation is represented by expiry + an explicit error marker;
    // this model has no revokedAt field. Assert the actual persisted contract.
    const revoked = await prisma.apiToken.findUniqueOrThrow({
      where: { id: tokenId },
      select: { expiresAt: true, lastError: true, lastErrorAt: true }
    });
    expect(revoked.expiresAt).not.toBeNull();
    expect(revoked.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(revoked.lastError).toBe("Token revoked by administrator.");
    expect(revoked.lastErrorAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: auditWhere }), "one confirmation must produce exactly one revocation audit").toBe(1);
    expect(actionPosts, "one confirmation must submit the original form exactly once").toBe(1);
    expect(onlyNextActions).toBe(true);
  } finally {
    page.off("request", trackAction);
    // AuditLog is immutable. Keep the stable owned actor as its anchor; never
    // delete audit rows or disable triggers. Remove only this run's fixtures.
    await prisma.apiToken.deleteMany({ where: { id: tokenId, workspaceId: seededDemoWorkspaceId, name: tokenName } });
    if (sessionId) {
      await prisma.authSession.deleteMany({ where: { id: sessionId, workspaceId: seededDemoWorkspaceId, userId: actorIdentity.id } });
    }
  }
});
