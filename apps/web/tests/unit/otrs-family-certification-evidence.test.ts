import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultOtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  recordOtrsCertificationRun: vi.fn(async (input: unknown) => input)
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    integration: { findFirst: mocks.findFirst },
    integrationDiagnosticStep: { findMany: mocks.findMany },
    webhookEndpoint: { count: mocks.count }
  }
}));

vi.mock("@/lib/integrations/otrs-family/certification", () => ({
  recordOtrsCertificationRun: mocks.recordOtrsCertificationRun
}));

function pollingConfigJson(acknowledged: boolean) {
  const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");
  return JSON.stringify({
    ...config,
    advanced: {
      ...config.advanced,
      pollingFallbackAcknowledged: acknowledged
    }
  });
}

describe("recordOtrsCertificationFromEvidence webhook honesty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([
      { key: "config", status: "succeeded" },
      { key: "auth", status: "succeeded" },
      { key: "ticket_search", status: "succeeded" }
    ]);
  });

  it("does not set webhookOk from a workspace webhook when this integration is polling-only", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "int-otrs",
      source: "otrs",
      configJson: pollingConfigJson(true)
    });
    mocks.count.mockResolvedValue(0);

    const { recordOtrsCertificationFromEvidence } = await import(
      "@/lib/integrations/otrs-family/service"
    );
    await recordOtrsCertificationFromEvidence({
      workspaceId: "ws-1",
      integrationId: "int-otrs",
      actorId: "user-1",
      diagnosticRunId: "diag-1",
      imported: 2,
      skipped: 0
    });

    expect(mocks.count).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws-1",
        integrationId: "int-otrs",
        status: "active"
      }
    });
    expect(mocks.recordOtrsCertificationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        diagnostics: expect.objectContaining({
          webhookOk: false,
          pollingFallbackAcknowledged: true
        })
      })
    );
  });

  it("sets webhookOk only when this integration has an active webhook", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "int-otrs",
      source: "znuny",
      configJson: pollingConfigJson(false)
    });
    mocks.count.mockResolvedValue(1);

    const { recordOtrsCertificationFromEvidence } = await import(
      "@/lib/integrations/otrs-family/service"
    );
    await recordOtrsCertificationFromEvidence({
      workspaceId: "ws-1",
      integrationId: "int-otrs",
      actorId: "user-1",
      diagnosticRunId: "diag-1"
    });

    expect(mocks.recordOtrsCertificationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        diagnostics: expect.objectContaining({
          webhookOk: true,
          pollingFallbackAcknowledged: false
        })
      })
    );
  });
});
