import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiError: vi.fn((code: string, message: string, status = 500) => ({ code, message, status })),
  apiJson: vi.fn((body: unknown, status = 200) => ({ body, status })),
  requestIdFromHeaders: vi.fn(() => "req-1"),
  requireSessionApi: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    auditLog: {
      create: vi.fn()
    },
    identityProvider: {
      findFirst: vi.fn()
    },
    groupRoleMapping: {
      upsert: vi.fn()
    }
  }
}));

vi.mock("@/lib/api/response", () => ({
  apiError: mocks.apiError,
  apiJson: mocks.apiJson,
  requestIdFromHeaders: mocks.requestIdFromHeaders
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("auth provider mappings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.requireSessionApi.mockResolvedValue({
      ok: true,
      user: {
        id: "actor-1",
        workspaceId: "workspace-1"
      }
    });
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({ id: "provider-1" });
    mocks.prisma.groupRoleMapping.upsert.mockResolvedValue({
      id: "mapping-1",
      externalGroupId: "External_Viewers",
      externalGroupName: "External Viewers",
      role: "VIEWER",
      priority: 25,
      isActive: true
    });
    mocks.prisma.auditLog.create.mockResolvedValue({});
  });

  it("uses provider-scoped compound unique upsert for mappings", async () => {
    const { POST } = await import("@/app/api/v1/auth/providers/[providerId]/mappings/route");
    const request = new Request("https://app.example.com/api/v1/auth/providers/provider-1/mappings", {
      method: "POST",
      body: JSON.stringify({
        externalGroupId: "External_Viewers",
        externalGroupName: "External Viewers",
        role: "VIEWER",
        priority: 25,
        isActive: true
      })
    });

    const response = await POST(request, { params: Promise.resolve({ providerId: "provider-1" }) });

    expect(response).toEqual({
      body: {
        mapping: {
          id: "mapping-1",
          externalGroupId: "External_Viewers",
          externalGroupName: "External Viewers",
          role: "VIEWER",
          priority: 25,
          isActive: true
        }
      },
      status: 201
    });
    expect(mocks.prisma.groupRoleMapping.upsert).toHaveBeenCalledWith({
      where: {
        workspaceId_providerId_externalGroupId_role: {
          workspaceId: "workspace-1",
          providerId: "provider-1",
          externalGroupId: "External_Viewers",
          role: "VIEWER"
        }
      },
      create: {
        workspaceId: "workspace-1",
        providerId: "provider-1",
        externalGroupId: "External_Viewers",
        externalGroupName: "External Viewers",
        role: "VIEWER",
        priority: 25,
        isActive: true
      },
      update: {
        externalGroupName: "External Viewers",
        priority: 25,
        isActive: true
      }
    });
  });
});
