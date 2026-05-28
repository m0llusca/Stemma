import { describe, expect, it } from "vitest";

describe("tRPC foundation", () => {
  it("exposes a typed health procedure", async () => {
    const { appRouter } = await import("@/server/trpc/root");
    const caller = appRouter.createCaller({ user: null });

    await expect(caller.health()).resolves.toEqual({ ok: true });
  });
});
