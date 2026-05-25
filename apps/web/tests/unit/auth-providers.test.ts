import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEntraAuthorizationMetadata,
  getDirectoryIntegrationGuidance,
  resolveIdentityPolicyFromExternalClaims,
  resolveIdentityPolicyForUser,
  resolveRoleFromExternalClaims
} from "@/lib/auth/providers";

const mocks = vi.hoisted(() => ({
  prisma: {
    groupRoleMapping: {
      findMany: vi.fn()
    },
    userIdentityGroup: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("auth provider helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.userIdentityGroup.findMany.mockResolvedValue([]);
  });

  it("builds Microsoft Entra endpoints from tenant metadata", () => {
    const metadata = buildEntraAuthorizationMetadata({
      tenantId: "tenant-123",
      clientId: "client-123",
      authorizationUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
      jwksUrl: "https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys",
      scopes: "openid profile email"
    });

    expect(metadata.authorizationUrl).toBe("https://login.microsoftonline.com/tenant-123/oauth2/v2.0/authorize");
    expect(metadata.tokenUrl).toBe("https://login.microsoftonline.com/tenant-123/oauth2/v2.0/token");
    expect(metadata.recommendedFlow).toBe("authorization_code_pkce");
  });

  it("prefers app roles over raw group mappings", async () => {
    const role = await resolveRoleFromExternalClaims("workspace-1", "provider-1", {
      appRoles: ["QC.Admin"],
      groups: ["Support_Agents"]
    });

    expect(role).toBe("ADMIN");
    expect(mocks.prisma.groupRoleMapping.findMany).not.toHaveBeenCalled();
  });

  it("falls back to active group mappings when app roles are absent", async () => {
    mocks.prisma.groupRoleMapping.findMany.mockResolvedValueOnce([
      { id: "mapping-qa", providerId: "provider-1", externalGroupId: "QC_Analysts", role: "QA_ANALYST", priority: 30 },
      { id: "mapping-agent", providerId: "provider-1", externalGroupId: "Support_Agents", role: "SUPPORT_AGENT", priority: 50 }
    ]);

    const role = await resolveRoleFromExternalClaims("workspace-1", "provider-1", {
      groups: ["QC_Analysts", "Support_Agents"]
    });

    expect(role).toBe("QA_ANALYST");
    expect(mocks.prisma.groupRoleMapping.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        isActive: true,
        externalGroupId: { in: ["QC_Analysts", "Support_Agents"] },
        OR: [{ providerId: "provider-1" }, { providerId: null }]
      },
      orderBy: [{ priority: "asc" }, { externalGroupId: "asc" }, { role: "asc" }, { id: "asc" }],
      select: {
        id: true,
        providerId: true,
        externalGroupId: true,
        role: true,
        priority: true
      }
    });
  });

  it("resolves VIEWER from app roles", async () => {
    await expect(
      resolveRoleFromExternalClaims("workspace-1", "provider-1", {
        appRoles: ["QC.Viewer"]
      })
    ).resolves.toBe("VIEWER");
  });

  it("prefers provider-scoped mappings over global fallback mappings", async () => {
    mocks.prisma.groupRoleMapping.findMany.mockResolvedValueOnce([
      { id: "z", providerId: null, externalGroupId: "Support_Agents", role: "ADMIN", priority: 1 },
      { id: "b", providerId: "provider-1", externalGroupId: "Support_Agents", role: "QA_ANALYST", priority: 20 },
      { id: "a", providerId: "provider-1", externalGroupId: "QC_Analysts", role: "TEAM_LEAD", priority: 30 }
    ]);

    const policy = await resolveIdentityPolicyFromExternalClaims("workspace-1", "provider-1", {
      groups: ["Support_Agents", "QC_Analysts"],
      attributes: {
        department: "B2B",
        team: "Refunds"
      }
    });

    expect(policy).toMatchObject({
      role: "QA_ANALYST",
      roleSource: "group_mapping",
      matchedMappingId: "b",
      matchedProviderScopedMapping: true,
      supportLine: "B2B",
      teamName: "Refunds"
    });
  });

  it("uses global mappings only when no provider-scoped mapping matches", async () => {
    mocks.prisma.groupRoleMapping.findMany.mockResolvedValueOnce([
      { id: "global", providerId: null, externalGroupId: "Support_Agents", role: "SUPPORT_AGENT", priority: 10 }
    ]);

    await expect(
      resolveRoleFromExternalClaims("workspace-1", "provider-1", {
        groups: ["Support_Agents"]
      })
    ).resolves.toBe("SUPPORT_AGENT");
  });

  it("includes SCIM-provisioned provider group memberships when resolving a user policy", async () => {
    mocks.prisma.userIdentityGroup.findMany.mockResolvedValueOnce([
      { externalGroupId: "SCIM_QA" },
      { externalGroupId: "SCIM_Leads" }
    ]);
    mocks.prisma.groupRoleMapping.findMany.mockResolvedValueOnce([
      { id: "mapping-scim", providerId: "provider-1", externalGroupId: "SCIM_QA", role: "QA_ANALYST", priority: 10 }
    ]);

    const policy = await resolveIdentityPolicyForUser("workspace-1", "provider-1", "user-1", {
      groups: ["Token_Group"]
    });

    expect(policy).toMatchObject({
      role: "QA_ANALYST",
      roleSource: "group_mapping",
      matchedMappingId: "mapping-scim"
    });
    expect(mocks.prisma.userIdentityGroup.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        providerId: "provider-1",
        userId: "user-1"
      },
      select: {
        externalGroupId: true
      }
    });
    expect(mocks.prisma.groupRoleMapping.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          externalGroupId: { in: ["Token_Group", "SCIM_QA", "SCIM_Leads"] }
        })
      })
    );
  });

  it("orders within the chosen provider-scoped mapping set by priority and stable tie-breakers", async () => {
    mocks.prisma.groupRoleMapping.findMany.mockResolvedValueOnce([
      { id: "z", providerId: "provider-1", externalGroupId: "Z_Group", role: "ADMIN", priority: 20 },
      { id: "a", providerId: "provider-1", externalGroupId: "A_Group", role: "QA_ANALYST", priority: 20 }
    ]);

    await expect(
      resolveRoleFromExternalClaims("workspace-1", "provider-1", {
        groups: ["Z_Group", "A_Group"]
      })
    ).resolves.toBe("QA_ANALYST");
  });

  it("uses support agent as the least-privileged fallback role", async () => {
    await expect(resolveRoleFromExternalClaims("workspace-1", "provider-1", {})).resolves.toBe("SUPPORT_AGENT");
  });

  it("documents the preferred AD/Entra integration pattern", () => {
    expect(getDirectoryIntegrationGuidance()).toMatchObject({
      preferred: expect.stringContaining("Microsoft Entra ID"),
      fallback: expect.stringContaining("LDAPS")
    });
  });
});
