import { describe, expect, it } from "vitest";
import {
  assertProviderEndpointUrls,
  assertSafeProviderConfig,
  sanitizeProviderConfigForDisplay
} from "@/lib/auth/provider-config-validation";
import { validateLdapsProviderConfigForSave } from "@/lib/auth/ldaps";

describe("provider config validation", () => {
  it("rejects sensitive config keys recursively with a safe error", () => {
    expect(() =>
      assertSafeProviderConfig({
        nested: {
          password: "raw-password"
        }
      })
    ).toThrow(/секретные поля/);
  });

  it("redacts sensitive config before redisplay", () => {
    expect(
      sanitizeProviderConfigForDisplay(
        JSON.stringify({
          visible: "ok",
          nested: {
            authorizationHeader: "Bearer raw-token-value"
          }
        })
      )
    ).toContain('"authorizationHeader": "[redacted]"');
  });

  it("requires HTTPS endpoints except localhost HTTP", () => {
    expect(() =>
      assertProviderEndpointUrls({
        type: "OIDC",
        authorizationUrl: "http://issuer.example.com/auth",
        tokenUrl: "https://issuer.example.com/token",
        jwksUrl: "https://issuer.example.com/keys",
        samlMetadataUrl: null,
        configJson: "{}"
      })
    ).toThrow(/HTTPS/);

    expect(() =>
      assertProviderEndpointUrls({
        type: "SAML",
        authorizationUrl: null,
        tokenUrl: null,
        jwksUrl: null,
        samlMetadataUrl: "http://localhost:8080/metadata",
        configJson: JSON.stringify({ idpSsoUrl: "http://localhost:8080/sso" })
      })
    ).not.toThrow();
  });

  it("requires LDAPS-only directory sync configuration with ref-based bind and CA settings", () => {
    expect(() =>
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "active",
        ldapsUrl: "ldap://dc01.example.com:389",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: "env:QC_AD_BIND_PASSWORD",
        config: {
          userSearchBase: "OU=Users,DC=example,DC=com",
          groupSearchBase: "OU=Groups,DC=example,DC=com"
        }
      })
    ).toThrow(/LDAPS/);

    for (const ldapsUrl of [
      "ldaps://bind:password@dc01.example.com:636",
      "ldaps://dc01.example.com:636?x=1",
      "ldaps://dc01.example.com:636#frag"
    ]) {
      expect(() =>
        validateLdapsProviderConfigForSave({
          type: "ACTIVE_DIRECTORY_LDAPS",
          status: "active",
          ldapsUrl,
          ldapsBindDn: "CN=svc,DC=example,DC=com",
          ldapsBindSecretRef: "env:QC_AD_BIND_PASSWORD",
          config: {
            userSearchBase: "OU=Users,DC=example,DC=com",
            groupSearchBase: "OU=Groups,DC=example,DC=com"
          }
        })
      ).toThrow(/username\/password, query или fragment/);
    }

    expect(() =>
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "active",
        ldapsUrl: "ldaps://dc01.example.com:636",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: "env:QC_AD_BIND_PASSWORD",
        config: {
          userSearchBase: "OU=Users,DC=example,DC=com",
          groupSearchBase: "OU=Groups,DC=example,DC=com",
          nestedGroups: true,
          caCertRefs: ["env:QC_AD_CA_PEM"]
        }
      })
    ).not.toThrow();

    expect(() =>
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "draft",
        ldapsUrl: "ldaps://dc01.example.com:636",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: "vault:qc/ad/bind-password",
        config: {}
      })
    ).toThrow(/env:-ссылкой/);

    expect(() =>
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "draft",
        ldapsUrl: "ldaps://dc01.example.com:636",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: "secret:qc/ad/bind-password",
        config: {}
      })
    ).toThrow(/env:-ссылкой/);

    expect(() =>
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "draft",
        ldapsUrl: "ldaps://dc01.example.com:636",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: "env:QC_AD_BIND_PASSWORD",
        config: {
          caCertRefs: ["vault:qc/ad/ca"]
        }
      })
    ).toThrow(/env:-ссылкой/);
  });
});
