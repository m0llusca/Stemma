import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/certification/runs", () => ({
  createCertificationRun: vi.fn(async () => ({ id: "run-1", status: "running" })),
  appendCertificationStep: vi.fn(async (input) => ({ id: `step-${input.position}`, ...input })),
  finalizeCertificationRun: vi.fn(async () => ({ id: "run-1", status: "blocked" }))
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
        webhookOk: false
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
  });
});
