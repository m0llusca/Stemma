import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    apiToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("api token service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes scopes and rejects unknown values", async () => {
    const { allowedApiScopes, normalizeApiScopes } = await import("@/lib/api-token-service");

    expect(normalizeApiScopes(["reviews:read", "reviews:read", "reports:read"])).toBe("reviews:read,reports:read");
    expect(normalizeApiScopes(["all", "reviews:read"])).toBe("all");
    expect(allowedApiScopes).not.toContain("webhooks:write");
    expect(() => normalizeApiScopes(["webhooks:write"])).toThrow("Некорректный scope API-токена");
    expect(() => normalizeApiScopes(["unknown:scope"])).toThrow("Некорректный scope API-токена");
  });

  it("creates a hashed API token and returns plaintext only once", async () => {
    const { createApiToken } = await import("@/lib/api-token-service");
    mocks.prisma.apiToken.create.mockResolvedValue({
      id: "token-1",
      workspaceId: "workspace-1",
      name: "Integration",
      tokenPrefix: "qc_abc...",
      tokenHash: "hash",
      scopes: "reports:read",
      expiresAt: null
    });

    const created = await createApiToken({
      workspaceId: "workspace-1",
      name: "Integration",
      scopes: ["reports:read"]
    });

    expect(created.plainToken).toMatch(/^qc_/);
    expect(mocks.prisma.apiToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        name: "Integration",
        tokenPrefix: expect.stringMatching(/^qc_/),
        tokenHash: expect.any(String),
        scopes: "reports:read"
      })
    });
  });

  it("revokes only tokens from the current workspace", async () => {
    const { revokeApiToken } = await import("@/lib/api-token-service");
    mocks.prisma.apiToken.findFirst.mockResolvedValue({
      id: "token-1",
      workspaceId: "workspace-1",
      name: "Integration",
      tokenPrefix: "qc_abc..."
    });
    mocks.prisma.apiToken.update.mockResolvedValue({
      id: "token-1",
      workspaceId: "workspace-1",
      name: "Integration",
      tokenPrefix: "qc_abc...",
      expiresAt: new Date()
    });

    await revokeApiToken({
      workspaceId: "workspace-1",
      tokenId: "token-1"
    });

    expect(mocks.prisma.apiToken.findFirst).toHaveBeenCalledWith({
      where: {
        id: "token-1",
        workspaceId: "workspace-1"
      }
    });
    expect(mocks.prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: {
        expiresAt: expect.any(Date),
        lastError: "Token revoked by administrator.",
        lastErrorAt: expect.any(Date)
      }
    });
  });
});
