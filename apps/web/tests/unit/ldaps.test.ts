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
    delete process.env.QC_PROVIDER_AD_BIND_PASSWORD;
    delete process.env.QC_PROVIDER_AD_CA_PEM;
    delete process.env.QC_ALLOWED_SECRET_ENV;
  });

  it("parses LDAPS config defaults and attribute mappings", () => {
    const parsed = parseLdapsConfig({
      configJson: JSON.stringify({
        userSearchBase: "OU=Users,DC=example,DC=com",
        groupSearchBase: "OU=Groups,DC=example,DC=com",
        nestedGroups: true,
        caCertRefs: ["env:QC_PROVIDER_AD_CA_PEM"]
      })
    });

    expect(parsed.userSearchBase).toBe("OU=Users,DC=example,DC=com");
    expect(parsed.groupSearchBase).toBe("OU=Groups,DC=example,DC=com");
    expect(parsed.nestedGroups).toBe(true);
    expect(parsed.caCertRefs).toEqual(["env:QC_PROVIDER_AD_CA_PEM"]);
    expect(parsed.userAttributes.email).toEqual(["mail", "userPrincipalName"]);
  });

  it("requires LDAPS URLs without embedded credentials or query fragments", async () => {
    vi.stubEnv("QC_ALLOW_PRIVATE_BASE_URLS", "1");

    await expect(assertLdapsUrl("ldap://dc01.example.com:389")).rejects.toThrow(/LDAPS/);
    await expect(assertLdapsUrl("ldaps://bind:password@dc01.example.com:636")).rejects.toThrow(/username\/password/);
    await expect(assertLdapsUrl("ldaps://dc01.example.com:636")).resolves.toBeUndefined();
  });

  it("rejects private LDAPS hosts unless QC_ALLOW_PRIVATE_BASE_URLS=1", async () => {
    await expect(assertLdapsUrl("ldaps://127.0.0.1:636")).rejects.toThrow(
      /приватный адрес сети|QC_ALLOW_PRIVATE_BASE_URLS/
    );
    await expect(assertLdapsUrl("ldaps://10.0.0.5:636")).rejects.toThrow(
      /приватный адрес сети|QC_ALLOW_PRIVATE_BASE_URLS/
    );

    vi.stubEnv("QC_ALLOW_PRIVATE_BASE_URLS", "1");
    await expect(assertLdapsUrl("ldaps://10.0.0.5:636")).resolves.toBeUndefined();
  });

  it("accepts env and encrypted bind secrets at save time", async () => {
    vi.stubEnv("QC_ALLOW_PRIVATE_BASE_URLS", "1");
    const encryptedBindSecret = encryptSecret("bind-password");

    await expect(
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "active",
        ldapsUrl: "ldaps://dc01.example.com:636",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: "env:QC_PROVIDER_AD_BIND_PASSWORD",
        config: {
          userSearchBase: "OU=Users,DC=example,DC=com",
          groupSearchBase: "OU=Groups,DC=example,DC=com"
        }
      })
    ).resolves.toBeUndefined();

    await expect(
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "draft",
        ldapsUrl: "ldaps://dc01.example.com:636",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: encryptedBindSecret,
        config: {}
      })
    ).resolves.toBeUndefined();
  });

  it("rejects unsupported vault and inline bind secret references at save time", async () => {
    vi.stubEnv("QC_ALLOW_PRIVATE_BASE_URLS", "1");

    await expect(
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "draft",
        ldapsUrl: "ldaps://dc01.example.com:636",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: "vault:qc/ad/bind-password",
        config: {}
      })
    ).rejects.toThrow(/vault:\/secret:/);

    await expect(
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "draft",
        ldapsUrl: "ldaps://dc01.example.com:636",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: "raw-bind-password",
        config: {}
      })
    ).rejects.toThrow(/env:- или зашифрованной v1:/);

    await expect(
      validateLdapsProviderConfigForSave({
        type: "ACTIVE_DIRECTORY_LDAPS",
        status: "draft",
        ldapsUrl: "ldaps://dc01.example.com:636",
        ldapsBindDn: "CN=svc,DC=example,DC=com",
        ldapsBindSecretRef: "env:QC_PROVIDER_AD_BIND_PASSWORD",
        config: {
          caCertRefs: ["vault:qc/ad/ca"]
        }
      })
    ).rejects.toThrow(/vault:\/secret:/);
  });
});

describe("LDAPS secret resolution paths", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.QC_PROVIDER_AD_BIND_PASSWORD;
    delete process.env.QC_PROVIDER_AD_CA_PEM;
  });

  it("resolves bind and CA refs through the shared runtime helper", () => {
    process.env.QC_PROVIDER_AD_BIND_PASSWORD = "service-account-password";
    process.env.QC_PROVIDER_AD_CA_PEM = "/etc/ssl/certs/ad-ca.pem";

    expect(resolveSecretReference("env:QC_PROVIDER_AD_BIND_PASSWORD", "Bind-секрет LDAPS")).toBe(
      "service-account-password"
    );
    expect(resolveSecretReference("env:QC_PROVIDER_AD_CA_PEM", "LDAPS CA")).toBe("/etc/ssl/certs/ad-ca.pem");
  });
});
