import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    identityProvider: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    externalIdentity: {
      update: vi.fn()
    },
    identityGroup: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    userIdentityGroup: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn()
    },
    authSession: {
      updateMany: vi.fn()
    },
    groupRoleMapping: {
      findMany: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function activeProvider() {
  return {
    id: "provider-1",
    workspaceId: "workspace-1",
    name: "Entra",
    status: "active",
    scimTokenHash: "unused"
  };
}

describe("SCIM route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.identityProvider.findUnique.mockResolvedValue(activeProvider());
    mocks.prisma.identityProvider.update.mockResolvedValue({});
    mocks.prisma.auditLog.create.mockResolvedValue({});
    mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.userIdentityGroup.findMany.mockResolvedValue([]);
    mocks.prisma.groupRoleMapping.findMany.mockResolvedValue([]);
  });

  it("returns SCIM auth errors for missing bearer tokens", async () => {
    const { GET } = await import("@/app/scim/v2/Users/route");

    const response = await GET(new Request("https://app.example.com/scim/v2/Users"));
    const body = await json(response);

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/scim+json");
    expect(body).toMatchObject({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: "Bearer token is required.",
      status: "401"
    });
  });

  it("filters users by displayName through the route", async () => {
    mocks.prisma.user.count.mockResolvedValue(1);
    mocks.prisma.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        workspaceId: "workspace-1",
        email: "ada@example.com",
        name: "Ada Lovelace",
        lifecycleStatus: "ACTIVE",
        createdAt: new Date("2026-05-18T10:00:00.000Z"),
        updatedAt: new Date("2026-05-18T10:00:00.000Z"),
        externalIdentities: [{ externalId: "entra-user-1", providerSubject: "entra-user-1", displayName: "Ada Lovelace" }]
      }
    ]);
    const { GET } = await import("@/app/scim/v2/Users/route");

    const response = await GET(
      new Request('https://app.example.com/scim/v2/Users?filter=displayName%20eq%20"Ada%20Lovelace"', {
        headers: { authorization: "Bearer scim_test_token" }
      })
    );
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      totalResults: 1,
      Resources: [expect.objectContaining({ displayName: "Ada Lovelace" })]
    });
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { name: "Ada Lovelace" },
                {
                  externalIdentities: {
                    some: {
                      providerId: "provider-1",
                      displayName: "Ada Lovelace"
                    }
                  }
                }
              ]
            }
          ]
        })
      })
    );
  });

  it("serves SCIM discovery endpoints with SCIM content type", async () => {
    const serviceProviderConfig = await import("@/app/scim/v2/ServiceProviderConfig/route");
    const schemas = await import("@/app/scim/v2/Schemas/route");
    const resourceTypes = await import("@/app/scim/v2/ResourceTypes/route");
    const request = new Request("https://app.example.com/scim/v2/ServiceProviderConfig", {
      headers: { authorization: "Bearer scim_test_token" }
    });

    const configResponse = await serviceProviderConfig.GET(request);
    const schemasResponse = await schemas.GET(request);
    const resourceTypesResponse = await resourceTypes.GET(request);

    expect(configResponse.status).toBe(200);
    expect(configResponse.headers.get("content-type")).toContain("application/scim+json");
    expect(await json(configResponse)).toMatchObject({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      patch: { supported: true }
    });
    expect(await json(schemasResponse)).toMatchObject({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      Resources: expect.arrayContaining([expect.objectContaining({ schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"] })])
    });
    expect(await json(resourceTypesResponse)).toMatchObject({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      Resources: expect.arrayContaining([expect.objectContaining({ schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"] })])
    });
  });

  it("filters groups by externalId through the route", async () => {
    mocks.prisma.identityGroup.count.mockResolvedValue(1);
    mocks.prisma.identityGroup.findMany.mockResolvedValue([
      {
        id: "group-1",
        workspaceId: "workspace-1",
        providerId: "provider-1",
        externalGroupId: "entra-group-1",
        externalGroupName: "Support",
        createdAt: new Date("2026-05-18T10:00:00.000Z"),
        updatedAt: new Date("2026-05-18T10:00:00.000Z"),
        members: []
      }
    ]);
    const { GET } = await import("@/app/scim/v2/Groups/route");

    const response = await GET(
      new Request('https://app.example.com/scim/v2/Groups?filter=externalId%20eq%20"entra-group-1"', {
        headers: { authorization: "Bearer scim_test_token" }
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.identityGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace-1",
          providerId: "provider-1",
          externalGroupId: "entra-group-1"
        }
      })
    );
  });

  it("returns 200 and Location when group POST updates an existing group", async () => {
    mocks.prisma.identityGroup.findFirst
      .mockResolvedValueOnce({ id: "group-1" })
      .mockResolvedValueOnce({
        id: "group-1",
        workspaceId: "workspace-1",
        providerId: "provider-1",
        externalGroupId: "entra-group-1",
        externalGroupName: "Support",
        createdAt: new Date("2026-05-18T10:00:00.000Z"),
        updatedAt: new Date("2026-05-18T10:00:00.000Z"),
        members: []
      });
    mocks.prisma.identityGroup.upsert.mockResolvedValue({
      id: "group-1",
      workspaceId: "workspace-1",
      providerId: "provider-1",
      externalGroupId: "entra-group-1",
      externalGroupName: "Support"
    });
    const { POST } = await import("@/app/scim/v2/Groups/route");

    const response = await POST(
      new Request("https://app.example.com/scim/v2/Groups", {
        method: "POST",
        headers: { authorization: "Bearer scim_test_token" },
        body: JSON.stringify({ displayName: "Support", externalId: "entra-group-1" })
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBe("/scim/v2/Groups/group-1");
  });

  it("rejects unsupported user PATCH paths with SCIM 400", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      lifecycleStatus: "ACTIVE",
      createdAt: new Date("2026-05-18T10:00:00.000Z"),
      updatedAt: new Date("2026-05-18T10:00:00.000Z"),
      externalIdentities: [{ id: "identity-1", externalId: "entra-user-1", providerSubject: "entra-user-1", displayName: "Ada Lovelace" }]
    });
    const { PATCH } = await import("@/app/scim/v2/Users/[id]/route");

    const response = await PATCH(
      new Request("https://app.example.com/scim/v2/Users/user-1", {
        method: "PATCH",
        headers: { authorization: "Bearer scim_test_token" },
        body: JSON.stringify({ Operations: [{ op: "Replace", path: "title", value: "Manager" }] })
      }),
      { params: Promise.resolve({ id: "user-1" }) }
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({
      scimType: "mutability",
      status: "400"
    });
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects group members that are not linked to the authenticated provider", async () => {
    mocks.prisma.identityGroup.findFirst.mockResolvedValue({
      id: "group-1",
      workspaceId: "workspace-1",
      providerId: "provider-1",
      externalGroupId: "entra-group-1",
      externalGroupName: "Support",
      members: []
    });
    mocks.prisma.user.findMany.mockResolvedValue([{ id: "user-linked" }]);
    const { PATCH } = await import("@/app/scim/v2/Groups/[id]/route");

    const response = await PATCH(
      new Request("https://app.example.com/scim/v2/Groups/group-1", {
        method: "PATCH",
        headers: { authorization: "Bearer scim_test_token" },
        body: JSON.stringify({
          Operations: [{ op: "Replace", path: "members", value: [{ value: "user-linked" }, { value: "user-other-provider" }] }]
        })
      }),
      { params: Promise.resolve({ id: "group-1" }) }
    );

    expect(response.status).toBe(400);
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["user-linked", "user-other-provider"] },
        workspaceId: "workspace-1",
        OR: [
          { sourceOfTruthProviderId: "provider-1" },
          {
            externalIdentities: {
              some: { providerId: "provider-1" }
            }
          }
        ]
      },
      select: { id: true }
    });
    expect(mocks.prisma.userIdentityGroup.upsert).not.toHaveBeenCalled();
  });

  it("rejects remove-by-value for members outside the authenticated provider", async () => {
    mocks.prisma.identityGroup.findFirst.mockResolvedValue({
      id: "group-1",
      workspaceId: "workspace-1",
      providerId: "provider-1",
      externalGroupId: "entra-group-1",
      externalGroupName: "Support",
      members: [{ userId: "user-linked" }]
    });
    mocks.prisma.user.findMany.mockResolvedValue([]);
    const { PATCH } = await import("@/app/scim/v2/Groups/[id]/route");

    const response = await PATCH(
      new Request("https://app.example.com/scim/v2/Groups/group-1", {
        method: "PATCH",
        headers: { authorization: "Bearer scim_test_token" },
        body: JSON.stringify({
          Operations: [{ op: "Remove", path: 'members[value eq "user-other-provider"]' }]
        })
      }),
      { params: Promise.resolve({ id: "group-1" }) }
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({
      scimType: "invalidValue",
      status: "400"
    });
    expect(mocks.prisma.userIdentityGroup.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("refreshes former member roles when deleting a SCIM group through the route", async () => {
    mocks.prisma.identityGroup.findFirst.mockResolvedValue({
      id: "group-1",
      workspaceId: "workspace-1",
      providerId: "provider-1",
      externalGroupId: "entra-group-1",
      externalGroupName: "Support",
      members: [{ userId: "user-1" }]
    });
    mocks.prisma.userIdentityGroup.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.identityGroup.delete.mockResolvedValue({});
    mocks.prisma.groupRoleMapping.findMany.mockResolvedValue([]);
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import("@/app/scim/v2/Groups/[id]/route");

    const response = await DELETE(
      new Request("https://app.example.com/scim/v2/Groups/group-1", {
        method: "DELETE",
        headers: { authorization: "Bearer scim_test_token" }
      }),
      { params: Promise.resolve({ id: "group-1" }) }
    );

    expect(response.status).toBe(204);
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "user-1",
        workspaceId: "workspace-1",
        OR: [
          { sourceOfTruthProviderId: "provider-1" },
          {
            externalIdentities: {
              some: { providerId: "provider-1" }
            }
          }
        ]
      },
      data: expect.objectContaining({
        role: "SUPPORT_AGENT",
        sourceOfTruthProviderId: "provider-1"
      })
    });
  });

  it("deprovisions users through PATCH active false and revokes sessions", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      lifecycleStatus: "ACTIVE",
      sourceOfTruthProviderId: "provider-1",
      createdAt: new Date("2026-05-18T10:00:00.000Z"),
      updatedAt: new Date("2026-05-18T10:00:00.000Z"),
      externalIdentities: [{ id: "identity-1", externalId: "entra-user-1", providerSubject: "entra-user-1", displayName: "Ada Lovelace" }]
    });
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({ id: "provider-1" });
    mocks.prisma.user.update
      .mockResolvedValueOnce({
        id: "user-1",
        workspaceId: "workspace-1",
        lifecycleStatus: "DEPROVISIONED",
        sourceOfTruthProviderId: "provider-1"
      })
      .mockResolvedValueOnce({
        id: "user-1",
        workspaceId: "workspace-1",
        email: "ada@example.com",
        name: "Ada Lovelace",
        lifecycleStatus: "DEPROVISIONED",
        createdAt: new Date("2026-05-18T10:00:00.000Z"),
        updatedAt: new Date("2026-05-18T10:00:00.000Z"),
        externalIdentities: [{ id: "identity-1", externalId: "entra-user-1", providerSubject: "entra-user-1", displayName: "Ada Lovelace" }]
      });
    mocks.prisma.externalIdentity.update.mockResolvedValue({});
    mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 2 });
    const { PATCH } = await import("@/app/scim/v2/Users/[id]/route");

    const response = await PATCH(
      new Request("https://app.example.com/scim/v2/Users/user-1", {
        method: "PATCH",
        headers: { authorization: "Bearer scim_test_token" },
        body: JSON.stringify({ Operations: [{ op: "Replace", path: "active", value: false }] })
      }),
      { params: Promise.resolve({ id: "user-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        status: "ACTIVE",
        workspaceId: "workspace-1"
      },
      data: {
        status: "REVOKED",
        revokedAt: expect.any(Date)
      }
    });
  });
});
