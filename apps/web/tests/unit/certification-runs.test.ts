import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
const stepCreateMock = vi.fn();
const updateMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    certificationRun: {
      create: createMock,
      update: updateMock,
      findUnique: findUniqueMock
    },
    certificationRunStep: {
      create: stepCreateMock
    }
  }
}));

describe("certification runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a running certification run with redacted summary defaults", async () => {
    const { createCertificationRun } = await import("@/lib/certification/runs");
    createMock.mockResolvedValue({
      id: "run-1",
      workspaceId: "workspace-1",
      targetType: "integration",
      source: "zendesk",
      provider: null,
      integrationId: "integration-1",
      identityProviderId: null,
      actorId: "user-1",
      status: "running",
      startedAt: new Date("2026-06-28T10:00:00.000Z"),
      finishedAt: null,
      nextActionJson: "{}",
      summaryJson: "{}"
    });

    const result = await createCertificationRun({
      workspaceId: "workspace-1",
      targetType: "integration",
      source: "zendesk",
      integrationId: "integration-1",
      actorId: "user-1"
    });

    expect(createMock).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        targetType: "integration",
        source: "zendesk",
        provider: null,
        integrationId: "integration-1",
        identityProviderId: null,
        actorId: "user-1",
        status: "running",
        nextActionJson: "{}",
        summaryJson: "{}"
      }
    });
    expect(result).toMatchObject({ id: "run-1", status: "running", nextAction: {} });
  });

  it("records ordered steps with redacted diagnostics", async () => {
    const { appendCertificationStep } = await import("@/lib/certification/runs");
    stepCreateMock.mockResolvedValue({
      id: "step-1",
      workspaceId: "workspace-1",
      runId: "run-1",
      stepKey: "auth_check",
      position: 2,
      status: "failed",
      detail: "Ошибка авторизации",
      hint: "Проверьте токен",
      diagnosticsJson: JSON.stringify({ Authorization: "[redacted]" }),
      startedAt: new Date("2026-06-28T10:00:00.000Z"),
      finishedAt: new Date("2026-06-28T10:00:01.000Z")
    });

    const result = await appendCertificationStep({
      workspaceId: "workspace-1",
      runId: "run-1",
      stepKey: "auth_check",
      position: 2,
      status: "failed",
      detail: "Ошибка авторизации",
      hint: "Проверьте токен",
      diagnostics: { Authorization: "Bearer raw" },
      finishedAt: new Date("2026-06-28T10:00:01.000Z")
    });

    expect(stepCreateMock.mock.calls[0][0].data.diagnosticsJson).toBe(JSON.stringify({ Authorization: "[redacted]" }));
    expect(result).toMatchObject({ stepKey: "auth_check", status: "failed" });
  });
});
