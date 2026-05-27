import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listIntegrationCapabilities: vi.fn(() => [
    {
      source: "custom_api",
      displayName: "Custom API",
      type: "custom_api",
      certification: { summary: { productionReady: true } }
    }
  ]),
  recordIntegrationDryRunFromInput: vi.fn().mockResolvedValue({
    ok: true,
    message: "Импорт поставлен в очередь.",
    integrationId: "integration-1",
    runId: "run-1",
    jobId: "job-1"
  })
}));

vi.mock("@/lib/integrations/capabilities", () => ({
  listIntegrationCapabilities: mocks.listIntegrationCapabilities
}));

vi.mock("@/lib/integration-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integration-actions")>();

  return {
    ...actual,
    recordIntegrationDryRunFromInput: mocks.recordIntegrationDryRunFromInput
  };
});

describe("integration tRPC router", () => {
  beforeEach(() => {
    mocks.listIntegrationCapabilities.mockClear();
    mocks.recordIntegrationDryRunFromInput.mockClear();
  });

  it("returns the integration catalog for authenticated users", async () => {
    const { appRouter } = await import("@/server/trpc/root");
    const caller = appRouter.createCaller({
      user: { id: "user-1", workspaceId: "workspace-1", role: "ADMIN" } as never
    });

    await expect(caller.integrations.catalog()).resolves.toEqual([
      expect.objectContaining({ source: "custom_api", displayName: "Custom API" })
    ]);
  });

  it("rejects unauthenticated catalog access", async () => {
    const { appRouter } = await import("@/server/trpc/root");
    const caller = appRouter.createCaller({ user: null });

    await expect(caller.integrations.catalog()).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });

  it("rejects catalog access for authenticated users without integration management permission", async () => {
    const { appRouter } = await import("@/server/trpc/root");
    const caller = appRouter.createCaller({
      user: { id: "user-1", workspaceId: "workspace-1", role: "QA_ANALYST" } as never
    });

    await expect(caller.integrations.catalog()).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    expect(mocks.listIntegrationCapabilities).not.toHaveBeenCalled();
  });

  it("queues integration imports through a typed mutation", async () => {
    const { appRouter } = await import("@/server/trpc/root");
    const caller = appRouter.createCaller({
      user: { id: "user-1", workspaceId: "workspace-1", role: "ADMIN" } as never
    });

    await expect(
      caller.integrations.queueImport({
        source: "ytsaurus",
        sourceLabel: "YTsaurus/YT",
        mode: "data_source",
        baseUrl: "https://yt.example.com",
        maxTickets: 100,
        batchSize: 25,
        dateRangeDays: 30,
        dryRun: true,
        deduplicate: true,
        config: { tablePath: "//home/qc/conversations" }
      })
    ).resolves.toMatchObject({
      ok: true,
      runId: "run-1"
    });
    expect(mocks.recordIntegrationDryRunFromInput).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "ytsaurus",
        mode: "data_source",
        config: { tablePath: "//home/qc/conversations" }
      })
    );
  });
});
