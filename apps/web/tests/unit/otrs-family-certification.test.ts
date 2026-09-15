import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/certification/runs", () => ({
  createCertificationRun: vi.fn(async () => ({ id: "run-1", status: "running" })),
  appendCertificationStep: vi.fn(async (input) => ({ id: `step-${input.position}`, ...input })),
  finalizeCertificationRun: vi.fn(async (input) => ({ id: "run-1", status: input.status, nextAction: input.nextAction }))
}));

vi.mock("@/lib/activation-events", () => ({
  emitActivationEvent: vi.fn(async () => ({ emitted: true }))
}));

describe("OTRS-family certification bridge", () => {
  it("turns diagnostics and sample import into ordered certification steps", async () => {
    const { buildOtrsCertificationSteps } = await import("@/lib/integrations/otrs-family/certification");
    const steps = buildOtrsCertificationSteps({
      source: "znuny",
      diagnostics: {
        routeDetected: true,
        authOk: true,
        ticketSearchOk: true,
        webhookOk: false,
        pollingFallbackAcknowledged: false
      },
      sampleImport: {
        imported: 18,
        skipped: 0
      }
    });

    expect(steps.map((step) => step.stepKey)).toEqual([
      "contract_check",
      "auth_check",
      "capability_check",
      "sample_import",
      "webhook_or_polling_check",
      "evidence_lock"
    ]);
    expect(steps.find((step) => step.stepKey === "webhook_or_polling_check")).toMatchObject({
      status: "blocked",
      hint: "Настройте webhook или подтвердите polling fallback для Znuny."
    });
    expect(steps.find((step) => step.stepKey === "evidence_lock")).toMatchObject({
      status: "passed"
    });
  });

  it("blocks evidence_lock when diagnostics are incomplete", async () => {
    const { buildOtrsCertificationSteps } = await import("@/lib/integrations/otrs-family/certification");
    const steps = buildOtrsCertificationSteps({
      source: "otrs",
      diagnostics: {
        routeDetected: true,
        authOk: false,
        ticketSearchOk: false,
        webhookOk: false,
        pollingFallbackAcknowledged: false
      },
      sampleImport: { imported: 0, skipped: 0 }
    });

    expect(steps.find((step) => step.stepKey === "evidence_lock")).toMatchObject({
      status: "blocked"
    });
  });

  it("records a blocking nextAction when live cert is not passed", async () => {
    const { finalizeCertificationRun } = await import("@/lib/certification/runs");
    const { recordOtrsCertificationRun } = await import("@/lib/integrations/otrs-family/certification");

    await recordOtrsCertificationRun({
      workspaceId: "ws-1",
      integrationId: "int-1",
      actorId: "user-1",
      source: "otrs",
      diagnostics: {
        routeDetected: true,
        authOk: true,
        ticketSearchOk: true,
        webhookOk: false,
        pollingFallbackAcknowledged: false
      },
      sampleImport: { imported: 1, skipped: 0 }
    });

    expect(finalizeCertificationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "blocked",
        nextAction: expect.objectContaining({
          label: "Закрыть блокер live cert",
          stepKey: "webhook_or_polling_check"
        })
      })
    );
  });

  it("says webhook is confirmed only when a webhook exists", async () => {
    const { buildOtrsCertificationSteps } = await import("@/lib/integrations/otrs-family/certification");
    const steps = buildOtrsCertificationSteps({
      source: "otrs",
      diagnostics: {
        routeDetected: true,
        authOk: true,
        ticketSearchOk: true,
        webhookOk: true,
        pollingFallbackAcknowledged: true
      },
      sampleImport: { imported: 1, skipped: 0 }
    });

    expect(steps.find((step) => step.stepKey === "webhook_or_polling_check")).toMatchObject({
      status: "passed",
      detail: "Webhook подтвержден."
    });
  });

  it("does not claim a webhook on polling-only", async () => {
    const { buildOtrsCertificationSteps } = await import("@/lib/integrations/otrs-family/certification");
    const steps = buildOtrsCertificationSteps({
      source: "otobo",
      diagnostics: {
        routeDetected: true,
        authOk: true,
        ticketSearchOk: true,
        webhookOk: false,
        pollingFallbackAcknowledged: true
      },
      sampleImport: { imported: 1, skipped: 0 }
    });

    const webhookStep = steps.find((step) => step.stepKey === "webhook_or_polling_check");
    expect(webhookStep).toMatchObject({
      status: "passed",
      detail: "Polling fallback подтвержден."
    });
    expect(webhookStep?.detail).not.toContain("Webhook подтвержден");
  });
});
