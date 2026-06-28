import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
const stepCreateMock = vi.fn();
const updateMock = vi.fn();
const findUniqueMock = vi.fn();
const integrationFindFirstMock = vi.fn();
const identityProviderFindFirstMock = vi.fn();
const userFindFirstMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    certificationRun: {
      create: createMock,
      update: updateMock,
      findUnique: findUniqueMock
    },
    certificationRunStep: {
      create: stepCreateMock
    },
    integration: {
      findFirst: integrationFindFirstMock
    },
    identityProvider: {
      findFirst: identityProviderFindFirstMock
    },
    user: {
      findFirst: userFindFirstMock
    }
  }
}));

describe("certification runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    integrationFindFirstMock.mockResolvedValue({ id: "integration-1" });
    identityProviderFindFirstMock.mockResolvedValue({ id: "provider-1" });
    userFindFirstMock.mockResolvedValue({ id: "user-1" });
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

  it("redacts step detail and hint before persistence", async () => {
    const { appendCertificationStep } = await import("@/lib/certification/runs");
    stepCreateMock.mockResolvedValue({
      id: "step-1",
      workspaceId: "workspace-1",
      runId: "run-1",
      stepKey: "auth_check",
      position: 1,
      status: "failed",
      detail: "[redacted]",
      hint: "https://[redacted]:[redacted]@example.com/path?redacted=1",
      diagnosticsJson: "{}",
      startedAt: new Date("2026-06-28T10:00:00.000Z"),
      finishedAt: null
    });

    await appendCertificationStep({
      workspaceId: "workspace-1",
      runId: "run-1",
      stepKey: "auth_check",
      position: 1,
      status: "failed",
      detail: "Request failed with Bearer raw-token client_secret=abc123 api_key: xyz",
      hint: "https://u:p@example.com/path?token=abc password hunter2 token raw-token"
    });

    const data = stepCreateMock.mock.calls[0][0].data;
    expect(data.detail).not.toContain("raw-token");
    expect(data.detail).not.toContain("abc123");
    expect(data.detail).not.toContain("xyz");
    expect(data.hint).not.toContain("u:p");
    expect(data.hint).not.toContain("token=abc");
    expect(data.hint).not.toContain("hunter2");
    expect(data.hint).not.toContain("raw-token");
  });

  it("finalizes a run through its workspace-scoped compound key", async () => {
    const { finalizeCertificationRun } = await import("@/lib/certification/runs");
    updateMock.mockResolvedValue({
      id: "run-1",
      workspaceId: "workspace-1",
      targetType: "integration",
      source: "zendesk",
      provider: null,
      integrationId: "integration-1",
      identityProviderId: null,
      actorId: "user-1",
      status: "passed",
      startedAt: new Date("2026-06-28T10:00:00.000Z"),
      finishedAt: new Date("2026-06-28T10:01:00.000Z"),
      nextActionJson: "{}",
      summaryJson: "{}"
    });

    await finalizeCertificationRun({
      workspaceId: "workspace-1",
      runId: "run-1",
      status: "passed",
      finishedAt: new Date("2026-06-28T10:01:00.000Z")
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_workspaceId: { id: "run-1", workspaceId: "workspace-1" } }
      })
    );
  });

  it("rejects certification run creation when the integration belongs to another workspace", async () => {
    const { createCertificationRun } = await import("@/lib/certification/runs");
    integrationFindFirstMock.mockResolvedValue(null);

    await expect(
      createCertificationRun({
        workspaceId: "workspace-1",
        targetType: "integration",
        source: "zendesk",
        integrationId: "integration-2"
      })
    ).rejects.toThrow("Integration integration-2 does not belong to workspace workspace-1.");

    expect(integrationFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "integration-2",
        workspaceId: "workspace-1"
      },
      select: { id: true }
    });
    expect(createMock).not.toHaveBeenCalled();
  });
});
