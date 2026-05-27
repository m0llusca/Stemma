import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/capabilities", () => ({
  listIntegrationCapabilities: () => [
    {
      source: "custom_api",
      displayName: "Custom API",
      type: "custom_api",
      certification: { summary: { productionReady: true } }
    }
  ]
}));

describe("integration tRPC router", () => {
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
});
