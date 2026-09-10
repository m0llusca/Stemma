import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/lib/secrets";
import {
  assertProductionSecretReference,
  assertSupportedSecretReference,
  isAllowedSecretEnvName,
  isEncryptedSecretReference,
  isManagedSecretReference,
  isSupportedSecretReference,
  resolveSecretReference
} from "@/lib/auth/secret-refs";

describe("secret-refs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.QC_PROVIDER_TEST_SECRET;
    delete process.env.QC_AD_BIND_PASSWORD;
    delete process.env.TEST_SECRET_REF;
    delete process.env.QC_ALLOWED_SECRET_ENV;
    delete process.env.AUTH_SECRET;
    delete process.env.QC_SECRET_KEY;
    delete process.env.DATABASE_URL;
  });

  it("detects managed and encrypted secret reference formats", () => {
    expect(isManagedSecretReference("env:QC_PROVIDER_OIDC_SECRET")).toBe(true);
    expect(isManagedSecretReference("vault:qc/oidc/secret")).toBe(true);
    expect(isManagedSecretReference("secret:qc/oidc/secret")).toBe(true);
    expect(isManagedSecretReference("inline-secret")).toBe(false);

    const encrypted = encryptSecret("bind-password");
    expect(isEncryptedSecretReference(encrypted)).toBe(true);
    expect(isSupportedSecretReference("env:QC_PROVIDER_AD_BIND_PASSWORD")).toBe(true);
    expect(isSupportedSecretReference(encrypted)).toBe(true);
    expect(isSupportedSecretReference("vault:qc/ad/bind-password")).toBe(false);
  });

  it("allowlists IdP prefixes or QC_ALLOWED_SECRET_ENV names", () => {
    expect(isAllowedSecretEnvName("QC_PROVIDER_AD_BIND")).toBe(true);
    expect(isAllowedSecretEnvName("SAML_IDP_CERT_CURRENT")).toBe(true);
    expect(isAllowedSecretEnvName("OIDC_CLIENT_SECRET")).toBe(true);
    expect(isAllowedSecretEnvName("LDAP_BIND_PASSWORD")).toBe(true);
    expect(isAllowedSecretEnvName("LDAPS_CA_PEM")).toBe(true);
    expect(isAllowedSecretEnvName("AUTH_SECRET")).toBe(false);
    expect(isAllowedSecretEnvName("QC_SECRET_KEY")).toBe(false);
    expect(isAllowedSecretEnvName("DATABASE_URL")).toBe(false);
    expect(isAllowedSecretEnvName("QC_AD_BIND_PASSWORD")).toBe(false);

    vi.stubEnv("QC_ALLOWED_SECRET_ENV", "QC_AD_BIND_PASSWORD, QC_AD_CA_PEM");
    expect(isAllowedSecretEnvName("QC_AD_BIND_PASSWORD")).toBe(true);
    expect(isAllowedSecretEnvName("QC_AD_CA_PEM")).toBe(true);
    expect(isAllowedSecretEnvName("AUTH_SECRET")).toBe(false);
  });

  it("resolves env and encrypted references at runtime", () => {
    process.env.QC_PROVIDER_TEST_SECRET = "resolved-from-env";

    expect(resolveSecretReference("env:QC_PROVIDER_TEST_SECRET", "Тестовый секрет")).toBe("resolved-from-env");

    const encrypted = encryptSecret("encrypted-bind-password");
    expect(resolveSecretReference(encrypted, "Тестовый секрет")).toBe("encrypted-bind-password");
  });

  it("rejects arbitrary and sensitive env names outside the allowlist", () => {
    process.env.AUTH_SECRET = "session-secret";
    process.env.QC_SECRET_KEY = "kms-key";
    process.env.DATABASE_URL = "postgres://local/db";
    process.env.QC_AD_BIND_PASSWORD = "should-not-resolve";

    expect(() => resolveSecretReference("env:AUTH_SECRET", "Секрет сессии")).toThrow(/allowlist/);
    expect(() => resolveSecretReference("env:QC_SECRET_KEY", "Ключ")).toThrow(/allowlist/);
    expect(() => resolveSecretReference("env:DATABASE_URL", "БД")).toThrow(/allowlist/);
    expect(() => resolveSecretReference("env:QC_AD_BIND_PASSWORD", "Bind-секрет LDAPS")).toThrow(/allowlist/);

    vi.stubEnv("QC_ALLOWED_SECRET_ENV", "QC_AD_BIND_PASSWORD");
    expect(resolveSecretReference("env:QC_AD_BIND_PASSWORD", "Bind-секрет LDAPS")).toBe("should-not-resolve");
  });

  it("fails closed on missing env values and unsupported vault references", () => {
    delete process.env.QC_PROVIDER_MISSING_SECRET;

    expect(() => resolveSecretReference("env:QC_PROVIDER_MISSING_SECRET", "Bind-секрет LDAPS")).toThrow(
      /пустую или отсутствующую переменную окружения/
    );
    expect(() => resolveSecretReference("vault:qc/ad/bind-password", "Bind-секрет LDAPS")).toThrow(
      /исполняются только env:- и зашифрованные v1:-ссылки/
    );
    expect(() => resolveSecretReference("secret:qc/ad/bind-password", "Bind-секрет LDAPS")).toThrow(
      /исполняются только env:- и зашифрованные v1:-ссылки/
    );
  });

  it("allows inline secrets only outside production", () => {
    expect(resolveSecretReference("inline-dev-secret", "Секрет клиента")).toBe("inline-dev-secret");

    vi.stubEnv("NODE_ENV", "production");
    expect(() => resolveSecretReference("inline-dev-secret", "Секрет клиента")).toThrow(/production/);
  });

  it("validates save-time secret reference policies", () => {
    const encrypted = encryptSecret("bind-password");

    expect(() => assertSupportedSecretReference("env:QC_PROVIDER_AD_BIND_PASSWORD", "Bind-секрет LDAPS")).not.toThrow();
    expect(() => assertSupportedSecretReference(encrypted, "Bind-секрет LDAPS")).not.toThrow();
    expect(() => assertSupportedSecretReference("vault:qc/ad/bind-password", "Bind-секрет LDAPS")).toThrow(/vault:\/secret:/);
    expect(() => assertSupportedSecretReference("inline-password", "Bind-секрет LDAPS")).toThrow(/env:- или зашифрованной v1:/);
    expect(() => assertSupportedSecretReference("env:AUTH_SECRET", "Секрет сессии")).toThrow(/allowlist/);

    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertProductionSecretReference("env:QC_PROVIDER_OIDC_SECRET")).not.toThrow();
    expect(() => assertProductionSecretReference(encrypted)).not.toThrow();
    expect(() => assertProductionSecretReference("inline-secret")).toThrow(/production/);
    expect(() => assertProductionSecretReference("vault:qc/oidc/secret")).toThrow(/vault:\/secret:/);
    expect(() => assertProductionSecretReference("secret:qc/oidc/secret")).toThrow(/vault:\/secret:/);
    expect(() => assertProductionSecretReference("env:AUTH_SECRET")).toThrow(/allowlist/);
  });
});
