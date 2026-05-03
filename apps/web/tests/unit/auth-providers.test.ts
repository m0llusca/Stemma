import { describe, expect, it, vi } from "vitest";
import { buildEntraAuthorizationMetadata, getDirectoryIntegrationGuidance, resolveRoleFromExternalClaims } from "@/lib/auth/providers";

const mocks = vi.hoisted(() => ({
  prisma: {
    groupRoleMapping: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("auth provider helpers", () => {
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
      groups: ["QC_Viewers"]
    });

    expect(role).toBe("ADMIN");
    expect(mocks.prisma.groupRoleMapping.findMany).not.toHaveBeenCalled();
  });

  it("falls back to active group mappings when app roles are absent", async () => {
    mocks.prisma.groupRoleMapping.findMany.mockResolvedValueOnce([
      { role: "QA_ANALYST", priority: 30 },
      { role: "VIEWER", priority: 50 }
    ]);

    const role = await resolveRoleFromExternalClaims("workspace-1", "provider-1", {
      groups: ["QC_Analysts", "QC_Viewers"]
    });

    expect(role).toBe("QA_ANALYST");
    expect(mocks.prisma.groupRoleMapping.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        isActive: true,
        externalGroupId: { in: ["QC_Analysts", "QC_Viewers"] },
        providerId: "provider-1"
      },
      orderBy: [{ priority: "asc" }]
    });
  });

  it("documents the preferred AD/Entra integration pattern", () => {
    expect(getDirectoryIntegrationGuidance()).toMatchObject({
      preferred: expect.stringContaining("Microsoft Entra ID"),
      fallback: expect.stringContaining("LDAPS")
    });
  });
});

