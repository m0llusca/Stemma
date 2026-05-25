import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    identityProvider: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn()
    },
    user: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn()
    },
    externalIdentity: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    identityGroup: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    userIdentityGroup: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn()
    },
    groupRoleMapping: {
      findMany: vi.fn()
    },
    authSession: {
      updateMany: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("SCIM inbound provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.auditLog.create.mockResolvedValue({});
    mocks.prisma.userIdentityGroup.findMany.mockResolvedValue([]);
    mocks.prisma.groupRoleMapping.findMany.mockResolvedValue([]);
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 0 });
  });

  it("authenticates a bearer token by hash and scopes the request to one active provider workspace", async () => {
    const { authenticateScimRequest, hashScimToken } = await import("@/lib/auth/scim");
    const plainToken = "scim_test_token";
    mocks.prisma.identityProvider.findUnique.mockResolvedValue({
      id: "provider-1",
      workspaceId: "workspace-1",
      name: "Entra",
      status: "active",
      scimTokenHash: hashScimToken(plainToken)
    });

    const result = await authenticateScimRequest(
      new Request("https://app.example.com/scim/v2/Users", {
        headers: { authorization: `Bearer ${plainToken}` }
      })
    );

    expect(result).toMatchObject({
      ok: true,
      context: {
        providerId: "provider-1",
        workspaceId: "workspace-1"
      }
    });
    expect(mocks.prisma.identityProvider.findUnique).toHaveBeenCalledWith({
      where: { scimTokenHash: hashScimToken(plainToken) },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        status: true,
        scimTokenHash: true
      }
    });
  });

  it("issues a SCIM provisioning token with hash-only storage and redacted audit metadata", async () => {
    const { hashScimToken, issueScimProvisioningToken } = await import("@/lib/auth/scim");
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({
      id: "provider-1",
      workspaceId: "workspace-1",
      name: "Entra",
      type: "MICROSOFT_ENTRA_ID",
      scimTokenPrefix: null,
      scimTokenHash: null,
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    });
    mocks.prisma.identityProvider.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.identityProvider.findUniqueOrThrow.mockImplementation(async () => ({
      id: "provider-1",
      workspaceId: "workspace-1",
      name: "Entra",
      type: "MICROSOFT_ENTRA_ID",
      scimTokenPrefix: mocks.prisma.identityProvider.updateMany.mock.calls.at(-1)?.[0].data.scimTokenPrefix,
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    }));

    const result = await issueScimProvisioningToken({
      workspaceId: "workspace-1",
      providerId: "provider-1",
      actorId: "actor-1"
    });

    expect(result.plainToken).toMatch(/^scim_/);
    expect(mocks.prisma.identityProvider.updateMany).toHaveBeenCalledWith({
      where: {
        id: "provider-1",
        workspaceId: "workspace-1",
        scimTokenHash: null
      },
      data: {
        scimTokenPrefix: `${result.plainToken.slice(0, 10)}...`,
        scimTokenHash: hashScimToken(result.plainToken)
      }
    });
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "actor-1",
        action: "auth.scim_token_issued",
        targetType: "identity_provider",
        targetId: "provider-1"
      })
    });
    expect(JSON.stringify(mocks.prisma.identityProvider.updateMany.mock.calls)).not.toContain(result.plainToken);
    expect(JSON.stringify(mocks.prisma.auditLog.create.mock.calls)).not.toContain(result.plainToken);
  });

  it("rotates and revokes SCIM provisioning tokens without persisting plaintext", async () => {
    const { hashScimToken, revokeScimProvisioningToken, rotateScimProvisioningToken } = await import("@/lib/auth/scim");
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({
      id: "provider-1",
      workspaceId: "workspace-1",
      name: "Entra",
      type: "MICROSOFT_ENTRA_ID",
      scimTokenPrefix: "scim_old12...",
      scimTokenHash: "old-hash",
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    });
    mocks.prisma.identityProvider.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.identityProvider.findUniqueOrThrow.mockImplementation(async () => ({
      id: "provider-1",
      workspaceId: "workspace-1",
      name: "Entra",
      type: "MICROSOFT_ENTRA_ID",
      scimTokenPrefix: mocks.prisma.identityProvider.updateMany.mock.calls.at(-1)?.[0].data.scimTokenPrefix,
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    }));

    const rotated = await rotateScimProvisioningToken({
      workspaceId: "workspace-1",
      providerId: "provider-1",
      actorId: "actor-1"
    });

    expect(rotated.plainToken).toMatch(/^scim_/);
    expect(mocks.prisma.identityProvider.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "provider-1",
          workspaceId: "workspace-1",
          scimTokenHash: "old-hash"
        },
        data: {
          scimTokenPrefix: `${rotated.plainToken.slice(0, 10)}...`,
          scimTokenHash: hashScimToken(rotated.plainToken)
        }
      })
    );
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "auth.scim_token_rotated",
        metadata: expect.not.stringContaining(rotated.plainToken)
      })
    });

    await revokeScimProvisioningToken({
      workspaceId: "workspace-1",
      providerId: "provider-1",
      actorId: "actor-1"
    });

    expect(mocks.prisma.identityProvider.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          scimTokenPrefix: null,
          scimTokenHash: null
        }
      })
    );
    expect(mocks.prisma.auditLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        action: "auth.scim_token_revoked",
        metadata: expect.not.stringContaining(rotated.plainToken)
      })
    });
  });

  it("rejects stale SCIM token lifecycle writes before returning a one-time token", async () => {
    const { issueScimProvisioningToken } = await import("@/lib/auth/scim");
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({
      id: "provider-1",
      workspaceId: "workspace-1",
      name: "Entra",
      type: "MICROSOFT_ENTRA_ID",
      scimTokenPrefix: null,
      scimTokenHash: null,
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    });
    mocks.prisma.identityProvider.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      issueScimProvisioningToken({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        actorId: "actor-1"
      })
    ).rejects.toMatchObject({
      code: "stale"
    });

    expect(mocks.prisma.identityProvider.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("creates a user and external identity without storing or auditing raw SCIM tokens", async () => {
    const { createScimUser } = await import("@/lib/auth/scim");
    mocks.prisma.externalIdentity.findFirst.mockResolvedValue(null);
    mocks.prisma.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "user-1",
        workspaceId: "workspace-1",
        email: "ada@example.com",
        name: "Ada Lovelace",
        role: "SUPPORT_AGENT",
        lifecycleStatus: "ACTIVE",
        createdAt: new Date("2026-05-18T10:00:00.000Z"),
        updatedAt: new Date("2026-05-18T10:00:00.000Z"),
        externalIdentities: [{ externalId: "entra-user-1", providerSubject: "entra-user-1", displayName: "Ada Lovelace" }]
      });
    mocks.prisma.user.create.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      role: "SUPPORT_AGENT",
      lifecycleStatus: "ACTIVE",
      createdAt: new Date("2026-05-18T10:00:00.000Z"),
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    });
    mocks.prisma.externalIdentity.create.mockResolvedValue({});

    const result = await createScimUser(
      { workspaceId: "workspace-1", providerId: "provider-1", providerName: "Entra" },
      {
        userName: "ada@example.com",
        externalId: "entra-user-1",
        name: { givenName: "Ada", familyName: "Lovelace" },
        active: true,
        emails: [{ value: "ada@example.com", primary: true }]
      }
    );

    expect(result.status).toBe(201);
    expect(result.resource).toMatchObject({
      id: "user-1",
      userName: "ada@example.com",
      externalId: "entra-user-1",
      active: true
    });
    expect(mocks.prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        email: "ada@example.com",
        name: "Ada Lovelace",
        lifecycleStatus: "ACTIVE",
        sourceOfTruthProviderId: "provider-1"
      })
    });
    expect(mocks.prisma.externalIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerId: "provider-1",
        providerSubject: "entra-user-1",
        externalId: "entra-user-1",
        email: "ada@example.com"
      })
    });
    expect(JSON.stringify(mocks.prisma.auditLog.create.mock.calls)).not.toContain("scim_test_token");
  });

  it("deactivates a SCIM user and revokes active sessions through lifecycle helpers", async () => {
    const { patchScimUser } = await import("@/lib/auth/scim");
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      role: "SUPPORT_AGENT",
      lifecycleStatus: "ACTIVE",
      sourceOfTruthProviderId: "provider-1",
      createdAt: new Date("2026-05-18T10:00:00.000Z"),
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    });
    mocks.prisma.identityProvider.findFirst = vi.fn().mockResolvedValue({ id: "provider-1" });
    mocks.prisma.user.update.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      lifecycleStatus: "DEPROVISIONED",
      sourceOfTruthProviderId: "provider-1"
    });
    mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 2 });
    mocks.prisma.externalIdentity.update.mockResolvedValue({});
    mocks.prisma.user.findFirst.mockResolvedValueOnce({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      role: "SUPPORT_AGENT",
      lifecycleStatus: "ACTIVE",
      sourceOfTruthProviderId: "provider-1",
      createdAt: new Date("2026-05-18T10:00:00.000Z"),
      updatedAt: new Date("2026-05-18T10:00:00.000Z")
    });

    await patchScimUser(
      { workspaceId: "workspace-1", providerId: "provider-1", providerName: "Entra" },
      "user-1",
      {
        Operations: [{ op: "Replace", path: "active", value: false }]
      }
    );

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
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "scim.user_deactivated",
        targetId: "user-1"
      })
    });
  });

  it("revokes active sessions when an idempotent SCIM create updates an existing identity to inactive", async () => {
    const { createScimUser } = await import("@/lib/auth/scim");
    mocks.prisma.externalIdentity.findFirst.mockResolvedValue({
      id: "identity-1",
      userId: "user-1",
      providerId: "provider-1",
      user: {
        id: "user-1",
        workspaceId: "workspace-1",
        email: "ada@example.com",
        name: "Ada Lovelace",
        role: "SUPPORT_AGENT",
        lifecycleStatus: "ACTIVE",
        sourceOfTruthProviderId: "provider-1",
        createdAt: new Date("2026-05-18T10:00:00.000Z"),
        updatedAt: new Date("2026-05-18T10:00:00.000Z"),
        externalIdentities: [{ externalId: "entra-user-1", providerSubject: "entra-user-1", displayName: "Ada Lovelace" }]
      }
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
        role: "SUPPORT_AGENT",
        lifecycleStatus: "DEPROVISIONED",
        createdAt: new Date("2026-05-18T10:00:00.000Z"),
        updatedAt: new Date("2026-05-18T10:00:00.000Z"),
        externalIdentities: [{ externalId: "entra-user-1", providerSubject: "entra-user-1", displayName: "Ada Lovelace" }]
      });
    mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 1 });

    await createScimUser(
      { workspaceId: "workspace-1", providerId: "provider-1", providerName: "Entra" },
      {
        userName: "ada@example.com",
        externalId: "entra-user-1",
        active: false
      }
    );

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

  it("replaces group membership in provider-scoped identity groups", async () => {
    const { patchScimGroup } = await import("@/lib/auth/scim");
    mocks.prisma.identityGroup.findFirst.mockResolvedValue({
      id: "group-1",
      workspaceId: "workspace-1",
      providerId: "provider-1",
      externalGroupId: "entra-group-1",
      externalGroupName: "Support"
    });
    mocks.prisma.identityGroup.update.mockResolvedValue({
      id: "group-1",
      workspaceId: "workspace-1",
      providerId: "provider-1",
      externalGroupId: "entra-group-1",
      externalGroupName: "Support"
    });
    mocks.prisma.userIdentityGroup.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.userIdentityGroup.upsert.mockResolvedValue({});
    mocks.prisma.user.findMany.mockResolvedValue([{ id: "user-1" }, { id: "user-2" }]);

    const result = await patchScimGroup(
      { workspaceId: "workspace-1", providerId: "provider-1", providerName: "Entra" },
      "group-1",
      {
        Operations: [
          {
            op: "Replace",
            path: "members",
            value: [{ value: "user-1" }, { value: "user-2" }]
          }
        ]
      }
    );

    expect(result.resource).toMatchObject({
      id: "group-1",
      displayName: "Support"
    });
    expect(mocks.prisma.userIdentityGroup.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        providerId: "provider-1",
        externalGroupId: "entra-group-1"
      }
    });
    expect(mocks.prisma.userIdentityGroup.upsert).toHaveBeenCalledTimes(2);
  });

  it("validates SCIM remove-by-value member IDs before deleting or refreshing policy", async () => {
    const { patchScimGroup } = await import("@/lib/auth/scim");
    mocks.prisma.identityGroup.findFirst.mockResolvedValue({
      id: "group-1",
      workspaceId: "workspace-1",
      providerId: "provider-1",
      externalGroupId: "entra-group-1",
      externalGroupName: "Support",
      members: [{ userId: "user-linked" }]
    });
    mocks.prisma.user.findMany.mockResolvedValue([]);

    await expect(
      patchScimGroup(
        { workspaceId: "workspace-1", providerId: "provider-1", providerName: "Entra" },
        "group-1",
        {
          Operations: [{ op: "Remove", path: 'members[value eq "user-other-provider"]' }]
        }
      )
    ).rejects.toMatchObject({
      status: 400,
      scimType: "invalidValue"
    });

    expect(mocks.prisma.userIdentityGroup.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("refreshes former member policies when removing all group members", async () => {
    const { patchScimGroup } = await import("@/lib/auth/scim");
    mocks.prisma.identityGroup.findFirst
      .mockResolvedValueOnce({
        id: "group-1",
        workspaceId: "workspace-1",
        providerId: "provider-1",
        externalGroupId: "entra-group-1",
        externalGroupName: "Support",
        members: [{ userId: "user-1" }, { userId: "user-2" }]
      })
      .mockResolvedValueOnce({
        id: "group-1",
        workspaceId: "workspace-1",
        providerId: "provider-1",
        externalGroupId: "entra-group-1",
        externalGroupName: "Support",
        members: []
      });
    mocks.prisma.userIdentityGroup.deleteMany.mockResolvedValue({ count: 2 });
    mocks.prisma.groupRoleMapping.findMany.mockResolvedValue([]);
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await patchScimGroup(
      { workspaceId: "workspace-1", providerId: "provider-1", providerName: "Entra" },
      "group-1",
      {
        Operations: [{ op: "Remove", path: "members" }]
      }
    );

    expect(mocks.prisma.userIdentityGroup.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        providerId: "provider-1",
        externalGroupId: "entra-group-1"
      }
    });
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
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledTimes(2);
  });

  it("refreshes former member policies when deleting a SCIM group", async () => {
    const { deleteScimGroup } = await import("@/lib/auth/scim");
    mocks.prisma.identityGroup.findFirst.mockResolvedValue({
      id: "group-1",
      workspaceId: "workspace-1",
      providerId: "provider-1",
      externalGroupId: "entra-group-1",
      externalGroupName: "Support",
      members: [{ userId: "user-1" }, { userId: "user-2" }]
    });
    mocks.prisma.userIdentityGroup.deleteMany.mockResolvedValue({ count: 2 });
    mocks.prisma.identityGroup.delete.mockResolvedValue({});
    mocks.prisma.groupRoleMapping.findMany.mockResolvedValue([]);
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await deleteScimGroup({ workspaceId: "workspace-1", providerId: "provider-1", providerName: "Entra" }, "group-1");

    expect(mocks.prisma.user.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "user-2",
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
    expect(mocks.prisma.identityGroup.delete).toHaveBeenCalledWith({
      where: { id: "group-1" }
    });
  });
});
