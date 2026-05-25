import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertCanPersistSettings: vi.fn(),
  requireCurrentUserPermission: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    auditLog: {
      create: vi.fn()
    },
    identityProvider: {
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn()
    },
    groupRoleMapping: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn()
    }
  }
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/current-user", () => ({
  assertCanPersistSettings: mocks.assertCanPersistSettings,
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("auth provider server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserPermission.mockResolvedValue({
      id: "actor-1",
      workspaceId: "workspace-1"
    });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({ id: "provider-1" });
    mocks.prisma.identityProvider.upsert.mockResolvedValue({
      id: "provider-1",
      type: "OIDC",
      slug: "generic-oidc",
      status: "draft",
      clientSecretRef: null
    });
    mocks.prisma.identityProvider.update.mockResolvedValue({
      id: "provider-1",
      type: "OIDC",
      slug: "generic-oidc",
      status: "draft",
      clientSecretRef: null
    });
    mocks.prisma.groupRoleMapping.findFirst.mockResolvedValue(null);
    mocks.prisma.groupRoleMapping.create.mockResolvedValue({
      id: "mapping-1",
      providerId: null,
      externalGroupId: "External_Viewers",
      role: "VIEWER",
      priority: 40,
      isActive: true
    });
    mocks.prisma.groupRoleMapping.update.mockResolvedValue({
      id: "mapping-1",
      providerId: null,
      externalGroupId: "External_Viewers",
      role: "VIEWER",
      priority: 40,
      isActive: true
    });
    mocks.prisma.groupRoleMapping.upsert.mockResolvedValue({
      id: "mapping-1",
      providerId: "provider-1",
      externalGroupId: "External_Viewers",
      role: "VIEWER",
      priority: 40,
      isActive: true
    });
    mocks.prisma.auditLog.create.mockResolvedValue({});
  });

  it("allows VIEWER and uses provider-scoped upsert for provider mappings", async () => {
    const { saveGroupRoleMapping } = await import("@/lib/auth-provider-actions");
    const formData = new FormData();
    formData.set("providerId", "provider-1");
    formData.set("externalGroupId", "External_Viewers");
    formData.set("externalGroupName", "External Viewers");
    formData.set("role", "VIEWER");
    formData.set("priority", "40");
    formData.set("isActive", "on");

    await expect(saveGroupRoleMapping(formData)).rejects.toThrow("NEXT_REDIRECT:/admin/access?section=mappings&provider=provider-1");

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
        priority: 40,
        isActive: true
      },
      update: {
        externalGroupName: "External Viewers",
        priority: 40,
        isActive: true
      }
    });
  });

  it("retries global mappings after a partial unique conflict", async () => {
    mocks.prisma.groupRoleMapping.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "mapping-1" });
    mocks.prisma.groupRoleMapping.create.mockRejectedValueOnce({ code: "P2002" });
    const { saveGroupRoleMapping } = await import("@/lib/auth-provider-actions");
    const formData = new FormData();
    formData.set("externalGroupId", "External_Viewers");
    formData.set("externalGroupName", "External Viewers");
    formData.set("role", "VIEWER");
    formData.set("priority", "40");
    formData.set("isActive", "on");

    await expect(saveGroupRoleMapping(formData)).rejects.toThrow("NEXT_REDIRECT:/admin/access?section=mappings");

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.groupRoleMapping.update).toHaveBeenCalledWith({
      where: { id: "mapping-1" },
      data: {
        externalGroupName: "External Viewers",
        priority: 40,
        isActive: true
      }
    });
  });

  it("rejects active generic OIDC providers without issuer before persistence", async () => {
    const { saveIdentityProvider } = await import("@/lib/auth-provider-actions");
    const formData = new FormData();
    formData.set("type", "OIDC");
    formData.set("name", "Generic OIDC");
    formData.set("slug", "generic-oidc");
    formData.set("status", "active");
    formData.set("clientId", "client-1");
    formData.set("authorizationUrl", "https://issuer.example.com/auth");
    formData.set("tokenUrl", "https://issuer.example.com/token");
    formData.set("jwksUrl", "https://issuer.example.com/keys");

    await expect(saveIdentityProvider(formData)).rejects.toThrow(/issuer/);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects sensitive provider config JSON before persistence", async () => {
    const { saveIdentityProvider } = await import("@/lib/auth-provider-actions");
    const formData = new FormData();
    formData.set("type", "SAML");
    formData.set("name", "SAML");
    formData.set("slug", "saml");
    formData.set("status", "draft");
    formData.set("configJson", JSON.stringify({ nested: { SAMLResponse: "raw-response" } }));

    await expect(saveIdentityProvider(formData)).rejects.toThrow(/секретные поля/);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects SAML provider config that disables all signature validation", async () => {
    const { saveIdentityProvider } = await import("@/lib/auth-provider-actions");
    const formData = new FormData();
    formData.set("type", "SAML");
    formData.set("name", "SAML");
    formData.set("slug", "saml");
    formData.set("status", "draft");
    formData.set(
      "configJson",
      JSON.stringify({
        wantAssertionsSigned: false,
        wantAuthnResponseSigned: false
      })
    );

    await expect(saveIdentityProvider(formData)).rejects.toThrow(/подпись/);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS provider endpoints except localhost", async () => {
    const { saveIdentityProvider } = await import("@/lib/auth-provider-actions");
    const formData = new FormData();
    formData.set("type", "OIDC");
    formData.set("name", "Generic OIDC");
    formData.set("slug", "generic-oidc");
    formData.set("status", "draft");
    formData.set("issuer", "https://issuer.example.com");
    formData.set("authorizationUrl", "http://issuer.example.com/auth");
    formData.set("tokenUrl", "https://issuer.example.com/token");
    formData.set("jwksUrl", "https://issuer.example.com/keys");

    await expect(saveIdentityProvider(formData)).rejects.toThrow(/HTTPS/);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();

    formData.set("authorizationUrl", "http://localhost:8080/auth");
    await expect(saveIdentityProvider(formData)).rejects.toThrow("NEXT_REDIRECT:/admin/access?section=provider&provider=provider-1");
  });
});
