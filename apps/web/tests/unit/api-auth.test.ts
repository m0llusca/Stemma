import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireApiToken } from "@/lib/api-auth";

const mocks = vi.hoisted(() => ({
  prisma: {
    apiToken: {
      findUnique: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

function request(headers: HeadersInit = {}) {
  return new Request("http://localhost/api/v1/conversations", { headers }) as never;
}

describe("api token auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the legacy unauthorized error body by default", async () => {
    const auth = await requireApiToken(request(), "conversations:read");

    expect(auth.ok).toBe(false);

    if (!auth.ok) {
      await expect(auth.response.json()).resolves.toEqual({ error: "API token is required." });
      expect(auth.response.status).toBe(401);
    }
  });

  it("returns a structured unauthorized error with request id", async () => {
    const auth = await requireApiToken(request({ "x-request-id": "req-auth-1" }), "conversations:read", {
      structuredErrors: true
    });

    expect(auth.ok).toBe(false);

    if (!auth.ok) {
      await expect(auth.response.json()).resolves.toEqual({
        error: {
          code: "unauthorized",
          message: "API token is required.",
          details: null,
          requestId: "req-auth-1"
        }
      });
      expect(auth.response.status).toBe(401);
      expect(auth.response.headers.get("x-request-id")).toBe("req-auth-1");
    }
  });

  it("accepts all scope and updates last used timestamp", async () => {
    mocks.prisma.apiToken.findUnique.mockResolvedValue({
      id: "token-1",
      workspaceId: "workspace-1",
      scopes: "all",
      expiresAt: null
    });
    mocks.prisma.apiToken.update.mockResolvedValue({});

    const auth = await requireApiToken(request({ authorization: "Bearer plain-token" }), "reviews:read", {
      structuredErrors: true
    });

    expect(auth).toEqual({ ok: true, workspaceId: "workspace-1", apiTokenId: "token-1" });
    expect(mocks.prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: { lastUsedAt: expect.any(Date) }
    });
  });
});
