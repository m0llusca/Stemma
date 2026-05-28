import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchRequestHandler: vi.fn(async () => Response.json({ ok: true }))
}));

vi.mock("@trpc/server/adapters/fetch", () => ({
  fetchRequestHandler: mocks.fetchRequestHandler
}));

vi.mock("@/server/trpc/context", () => ({
  createTRPCContext: vi.fn()
}));

vi.mock("@/server/trpc/root", () => ({
  appRouter: {}
}));

describe("tRPC route", () => {
  beforeEach(() => {
    mocks.fetchRequestHandler.mockClear();
  });

  it("blocks cross-origin state-changing requests before tRPC handling", async () => {
    const { POST } = await import("@/app/api/trpc/[trpc]/route");

    const response = await POST(
      new Request("https://qc.example.com/api/trpc/integrations.queueImport", {
        method: "POST",
        headers: {
          origin: "https://evil.example.com"
        },
        body: "{}"
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "forbidden",
        message: "Cross-origin request blocked."
      }
    });
    expect(mocks.fetchRequestHandler).not.toHaveBeenCalled();
  });

  it("requires Origin or Referer for state-changing requests", async () => {
    const { POST } = await import("@/app/api/trpc/[trpc]/route");

    const response = await POST(
      new Request("https://qc.example.com/api/trpc/integrations.queueImport", {
        method: "POST",
        body: "{}"
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "forbidden",
        message: "Origin header is required."
      }
    });
    expect(mocks.fetchRequestHandler).not.toHaveBeenCalled();
  });

  it("passes same-origin requests to tRPC", async () => {
    const { POST } = await import("@/app/api/trpc/[trpc]/route");
    const request = new Request("https://qc.example.com/api/trpc/integrations.queueImport", {
      method: "POST",
      headers: {
        origin: "https://qc.example.com"
      },
      body: "{}"
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.fetchRequestHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/api/trpc",
        req: request
      })
    );
  });

  it("passes safe requests to tRPC without Origin", async () => {
    const { GET } = await import("@/app/api/trpc/[trpc]/route");
    const request = new Request("https://qc.example.com/api/trpc/integrations.catalog", {
      method: "GET"
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.fetchRequestHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/api/trpc",
        req: request
      })
    );
  });
});
