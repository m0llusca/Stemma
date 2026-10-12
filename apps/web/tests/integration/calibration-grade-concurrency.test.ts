import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isLocalPlaywrightVerifyDatabase } from "@/lib/local-playwright-verify-database";

const fixture = vi.hoisted(() => ({
  workspaceId: "calibration-lock-workspace",
  userId: "calibration-lock-reviewer",
  conversationId: "calibration-lock-conversation",
  scorecardId: "calibration-lock-scorecard",
  criterionId: "calibration-lock-criterion"
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
// AuditLog is append-only in Postgres. Keep unrelated telemetry out of this
// concurrency fixture so cleanup never needs to disable database safeguards.
vi.mock("@/lib/audit", () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: async () => ({ id: fixture.userId, workspaceId: fixture.workspaceId, name: "Lock reviewer", role: "ADMIN" }),
  canFinalizeReview: () => true,
  canSaveReviewDraft: () => true,
  canSelfReview: () => true,
  canManageCalibration: () => true
}));

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function cleanup() {
  await prisma.backendJob.deleteMany({ where: { workspaceId: fixture.workspaceId } });
  await prisma.reviewEvent.deleteMany({ where: { workspaceId: fixture.workspaceId } });
  await prisma.review.deleteMany({ where: { workspaceId: fixture.workspaceId } });
  await prisma.calibrationSession.deleteMany({ where: { workspaceId: fixture.workspaceId } });
  await prisma.conversation.deleteMany({ where: { workspaceId: fixture.workspaceId } });
  await prisma.scorecardCriterion.deleteMany({ where: { scorecardId: fixture.scorecardId } });
  await prisma.scorecard.deleteMany({ where: { workspaceId: fixture.workspaceId } });
  // Preserve any immutable audit anchors left by earlier fixture runs.
  if (await prisma.auditLog.count({ where: { workspaceId: fixture.workspaceId } }) === 0) {
    await prisma.user.deleteMany({ where: { workspaceId: fixture.workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: fixture.workspaceId } });
  }
}

function gradeForm(sessionId: string) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    conversationId: fixture.conversationId,
    scorecardId: fixture.scorecardId,
    reviewSource: "CALIBRATION",
    calibrationSessionId: sessionId,
    summary: "Concurrent calibration grade",
    ownerType: "AGENT",
    riskLevel: "LOW",
    category: "Accuracy",
    [`criterion.${fixture.criterionId}.passed`]: "true"
  })) form.set(key, value);
  return form;
}

async function createSession() {
  return prisma.calibrationSession.create({ data: {
    workspaceId: fixture.workspaceId, ownerId: fixture.userId, scorecardId: fixture.scorecardId,
    name: "Lock fixture", status: "active",
    participants: { create: { userId: fixture.userId } },
    items: { create: { conversationId: fixture.conversationId } }
  } });
}

async function waitForDatabaseLock(pid: number) {
  // Observe an actual blocked Postgres statement, so timing cannot manufacture
  // a pass merely because the competing action has not started yet.
  await expect.poll(async () => {
    const rows = await prisma.$queryRaw<Array<{ wait_event_type: string | null }>>`
      SELECT wait_event_type FROM pg_stat_activity WHERE pid = ${pid}
    `;
    return rows[0]?.wait_event_type;
  }, { timeout: 3_000, interval: 10 }).toBe("Lock");
}

function pauseTransactions(mode: "grade" | "status") {
  const paused = deferred();
  const release = deferred();
  const contenderPid = deferred<number>();
  const original = prisma.$transaction.bind(prisma);
  let transactions = 0;

  vi.spyOn(prisma, "$transaction").mockImplementation((async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
    const index = ++transactions;
    return original(async (tx) => {
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      if (index === 2) contenderPid.resolve(pid);
      const database = new Proxy(tx, {
        get(target, property) {
          if (property === "$queryRaw") {
            return async (query: TemplateStringsArray, ...values: unknown[]) => {
              const rows = await target.$queryRaw(query, ...values);
              if (index === 1 && mode === "grade" && query.join("").includes('"CalibrationSession"')) {
                paused.resolve();
                await release.promise;
              }
              return rows;
            };
          }
          if (property === "calibrationSession") {
            return new Proxy(target.calibrationSession, {
              get(model, method) {
                if (method === "updateMany") {
                  return async (args: Parameters<typeof model.updateMany>[0]) => {
                    const result = await model.updateMany(args);
                    if (index === 1 && mode === "status") {
                      paused.resolve();
                      await release.promise;
                    }
                    return result;
                  };
                }
                return Reflect.get(model, method);
              }
            });
          }
          return Reflect.get(target, property);
        }
      });
      return callback(database);
    }, { timeout: 10_000 });
  }) as typeof prisma.$transaction);

  return { paused, release, contenderPid };
}

const cases = (["completed", "archived"] as const).flatMap((status) =>
  (["draft", "finalize"] as const).map((operation) => ({ status, operation }))
);

describe.skipIf(!process.env.TEST_DATABASE_URL).sequential("calibration grade/status serialization — isolated Postgres", () => {
  beforeAll(async () => {
    if (!isLocalPlaywrightVerifyDatabase() || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
      throw new Error("Calibration lock tests require the same isolated verify database in both URLs");
    }
    await cleanup();
    await prisma.workspace.upsert({ where: { id: fixture.workspaceId }, update: {}, create: { id: fixture.workspaceId, name: "Calibration lock fixtures" } });
    await prisma.user.upsert({ where: { id: fixture.userId }, update: {}, create: { id: fixture.userId, workspaceId: fixture.workspaceId, name: "Lock reviewer", email: "calibration-lock@example.invalid", role: "ADMIN" } });
    await prisma.scorecard.create({ data: {
      id: fixture.scorecardId, workspaceId: fixture.workspaceId, name: "Lock rubric", version: 1,
      criteria: { create: { id: fixture.criterionId, key: "accuracy", label: "Accuracy", kind: "PASS_FAIL", weight: 100, order: 1 } }
    } });
    await prisma.conversation.create({ data: {
      id: fixture.conversationId, workspaceId: fixture.workspaceId, externalSource: "calibration-lock", externalId: "case",
      channel: "CHAT", subject: "Lock case", status: "closed", tags: "", customerName: "Fixture", samplingReason: "Audit", openedAt: new Date()
    } });
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    if (isLocalPlaywrightVerifyDatabase() && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL) await cleanup();
  });

  it.each(cases)("makes $status wait for an in-flight $operation grade to commit", async ({ status, operation }) => {
    const { finalizeReview, saveReviewDraft } = await import("@/lib/review-actions");
    const { updateCalibrationSessionStatus } = await import("@/lib/calibration-actions");
    const session = await createSession();
    const barrier = pauseTransactions("grade");
    const grade = (operation === "draft" ? saveReviewDraft : finalizeReview)(gradeForm(session.id));
    const statusForm = new FormData();
    statusForm.set("id", session.id);
    statusForm.set("status", status);
    let statusUpdate: Promise<void> | undefined;
    try {
      await Promise.race([barrier.paused.promise, grade]);
      statusUpdate = updateCalibrationSessionStatus(statusForm);
      await waitForDatabaseLock(await barrier.contenderPid.promise);
      expect(await prisma.review.count({ where: { calibrationSessionId: session.id } })).toBe(0);
      barrier.release.resolve();
      await Promise.all([grade, statusUpdate]);
      expect(await prisma.review.count({ where: { calibrationSessionId: session.id, status: operation === "draft" ? "DRAFT" : "FINALIZED" } })).toBe(1);
      expect((await prisma.calibrationSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe(status);
    } finally {
      barrier.release.resolve();
      await Promise.allSettled([grade, ...(statusUpdate ? [statusUpdate] : [])]);
    }
  }, 15_000);

  it.each(cases)("rejects a $operation grade after a winning $status update commits", async ({ status, operation }) => {
    const { finalizeReview, saveReviewDraft } = await import("@/lib/review-actions");
    const { updateCalibrationSessionStatus } = await import("@/lib/calibration-actions");
    const session = await createSession();
    const barrier = pauseTransactions("status");
    const statusForm = new FormData();
    statusForm.set("id", session.id);
    statusForm.set("status", status);
    const statusUpdate = updateCalibrationSessionStatus(statusForm);
    let gradeResult: Promise<unknown> | undefined;
    try {
      await Promise.race([barrier.paused.promise, statusUpdate]);
      gradeResult = (operation === "draft" ? saveReviewDraft : finalizeReview)(gradeForm(session.id)).then(
        () => null,
        (error: unknown) => error
      );
      await waitForDatabaseLock(await barrier.contenderPid.promise);
      barrier.release.resolve();
      await statusUpdate;
      expect(await gradeResult).toBeInstanceOf(Error);
      expect((await gradeResult as Error).message).toContain("активной сессии");
      expect(await prisma.review.count({ where: { calibrationSessionId: session.id } })).toBe(0);
    } finally {
      barrier.release.resolve();
      await Promise.allSettled([statusUpdate, ...(gradeResult ? [gradeResult] : [])]);
    }
  }, 15_000);
});
