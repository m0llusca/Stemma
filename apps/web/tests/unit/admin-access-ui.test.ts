import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const accessPage = readFileSync(join(process.cwd(), "src/app/admin/access/page.tsx"), "utf8");

describe("admin access UI", () => {
  it("offers VIEWER in the group mapping role select options", () => {
    expect(accessPage).toContain('const roles: RoleName[] = ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT", "VIEWER"]');
  });

  it("treats SAML as an interactive SSO provider with honest setup guidance", () => {
    expect(accessPage).toContain('const interactiveSsoTypes: IdentityProviderType[] = ["MICROSOFT_ENTRA_ID", "OIDC", "SAML"]');
    expect(accessPage).toContain('if ((provider.type === "MICROSOFT_ENTRA_ID" || provider.type === "OIDC") && !provider.clientId)');
    expect(accessPage).not.toContain('if (!provider.clientId) missing.push("Идентификатор приложения")');
    expect(accessPage).toContain("function hasSamlIdpCertificates");
    expect(accessPage).toContain("function hasSamlIdpSsoUrl");
    expect(accessPage).toContain("config.idpSsoUrl");
    expect(accessPage).toContain("hasStringEntry(config.idpCertRefs)");
    expect(accessPage).toContain("hasStringEntry(config.idpCerts)");
    expect(accessPage).toContain('if (provider.type === "OIDC" && !provider.issuer) missing.push("Issuer")');
    expect(accessPage).toContain("Готов к контрактному тесту");
    expect(accessPage).toContain("Статус означает готовность к контрактному тесту");
  });

  it("displays SAML SP details from the same absolute URL builder used at runtime", () => {
    expect(accessPage).toContain('import { headers } from "next/headers"');
    expect(accessPage).toContain('import { buildSamlServiceProviderUrls } from "@/lib/auth/saml"');
    expect(accessPage).toContain('import { resolvePublicOrigin } from "@/lib/public-origin"');
    expect(accessPage).not.toContain("const origin = resolvePublicOrigin");
    expect(accessPage).toContain("buildSamlServiceProviderUrls(selectedProvider, resolvePublicOrigin({ headers: await headers() }))");
    expect(accessPage).toContain("samlMetadata.acsUrl");
    expect(accessPage).toContain("samlMetadata.metadataUrl");
    expect(accessPage).not.toContain("samlMetadata.acsPath");
    expect(accessPage).not.toContain("samlMetadata.metadataPath");
  });

  it("surfaces Microsoft Graph group-overage guidance without live-ready claims", () => {
    expect(accessPage).toContain("Graph fallback включайте только явно");
    expect(accessPage).toContain("GroupMember.Read.All");
    expect(accessPage).not.toContain("production-ready");
    expect(accessPage).not.toContain("live-ready");
  });

  it("describes LDAPS dry-run readiness and env-only executable refs", () => {
    expect(accessPage).toContain("Готов к dry-run");
    expect(accessPage).toContain("Готов к live-проверке");
    expect(accessPage).toContain("bind secret и CA сейчас исполняются только через env:-ссылки");
    expect(accessPage).not.toContain("CA через env:/vault:/secret:-ссылки");
  });

  it("surfaces reachable SCIM token lifecycle controls without production-live claims", () => {
    expect(accessPage).toContain('import { ScimTokenManager } from "@/components/admin/scim-token-manager"');
    expect(accessPage).toContain('{ value: "scim", label: "SCIM" }');
    expect(accessPage).toContain("Bearer-токен SCIM 2.0");
    expect(accessPage).toContain("selectedProvider.scimTokenPrefix");
    expect(accessPage).toContain("scimBaseUrl");
    expect(accessPage).toContain('const scimBaseUrl = "/scim/v2"');
    expect(accessPage).toContain('titleId="scim-token-title"');
    expect(accessPage).not.toContain('const scimBaseUrl = `${origin}/scim/v2`');
    expect(accessPage).not.toContain("SCIM production-ready");
  });
});
