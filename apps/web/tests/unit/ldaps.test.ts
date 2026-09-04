import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/lib/secrets";
import {
  assertLdapsUrl,
  parseLdapsConfig,
  validateLdapsProviderConfigForSave
} from "@/lib/auth/ldaps-config";
import { resolveSecretReference } from "@/lib/auth/secret-refs";

describe("LDAPS config validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses LDAPS config defaults and attribute mappings", () => {
    const parsed = parseLdapsConfig({
      configJson: JSON.stringify({
        userSearchBase: "OU=Users,DC=example,DC=com",
        groupSearchBase: "OU=Groups,DC=example,DC=com",
        nestedGroups: true,
        caCertRefs: ["env:QC_AD_CA_PEM"]
      })
    });

    expect(parsed.userSearchBase).toBe("OU=Users,DC=example,DC=com");
    expect(parsed.groupSearchBase).toBe("OU=Groups,DC=example,DC=com");
    expect(parsed.nestedGroups).toBe(true);
    expect(parsed.caCertRefs).toEqual(["env:QC_AD_CA_PEM"]);
    expect(parsed.userAttributes.email).toEqual(["mail", "userPrincipalName"]);
  });

  it("requires LDAPS URLs without embedded credentials or query fragments", () => {
    expect(() => assertLdapsUrl("ldap://dc01.example.com:389")).toThrow(/LDAPS/);
    expect(() => assertLdapsUrl("ldaps://bind:password@dc01.example.com:636")).toThrow(/username\/password/);
    expect(assertLdapsUrl("ldaps://dc01.example.com:636")).toBeUndefined();
  });

  it("accepts env and encrypted bind secrets at save time", () => {
    const encryptedBindSecret = encryptSecret("bind-password");

    expect(() =>
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "active",
        ldapsUrl: "ldaps://dc01.example.com:636",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: "env:QC_AD_BIND_PASSWORD",
        config: {
          userSearchBase: "OU=Users,DC=example,DC=com",
          groupSearchBase: "OU=Groups,DC=example,DC=com"
        }
      })
    ).not.toThrow();

    expect(() =>
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "draft",
        ldapsUrl: "ldaps://dc01.example.com:636",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: encryptedBindSecret,
        config: {}
      })
    ).not.toThrow();
  });

  it("rejects unsupported vault and inline bind secret references at save time", () => {
    expect(() =>
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "draft",
        ldapsUrl: "ldaps://dc01.example.com:636",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: "vault:qc/ad/bind-password",
        config: {}
      })
    ).toThrow(/vault:\/secret:/);

    expect(() =>
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "draft",
        ldapsUrl: "ldaps://dc01.example.com:636",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: "raw-bind-password",
        config: {}
      })
    ).toThrow(/env:- или зашифрованной v1:/);

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
    ).toThrow(/vault:\/secret:/);
  });
});

describe("LDAPS secret resolution paths", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves bind and CA refs through the shared runtime helper", () => {
    process.env.QC_AD_BIND_PASSWORD = "service-account-password";
    process.env.QC_AD_CA_PEM = "/etc/ssl/certs/ad-ca.pem";

    expect(resolveSecretReference("env:QC_AD_BIND_PASSWORD", "Bind-секрет LDAPS")).toBe("service-account-password");
    expect(resolveSecretReference("env:QC_AD_CA_PEM", "LDAPS CA")).toBe("/etc/ssl/certs/ad-ca.pem");
  });
});
