import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/lib/secrets";
import {
  assertProductionSecretReference,
  assertSupportedSecretReference,
  isEncryptedSecretReference,
  isManagedSecretReference,
  isSupportedSecretReference,
  resolveSecretReference
} from "@/lib/auth/secret-refs";

describe("secret-refs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("detects managed and encrypted secret reference formats", () => {
    expect(isManagedSecretReference("env:QC_OIDC_SECRET")).toBe(true);
    expect(isManagedSecretReference("vault:qc/oidc/secret")).toBe(true);
    expect(isManagedSecretReference("secret:qc/oidc/secret")).toBe(true);
    expect(isManagedSecretReference("inline-secret")).toBe(false);

    const encrypted = encryptSecret("bind-password");
    expect(isEncryptedSecretReference(encrypted)).toBe(true);
    expect(isSupportedSecretReference("env:QC_AD_BIND_PASSWORD")).toBe(true);
    expect(isSupportedSecretReference(encrypted)).toBe(true);
    expect(isSupportedSecretReference("vault:qc/ad/bind-password")).toBe(false);
  });

  it("resolves env and encrypted references at runtime", () => {
    process.env.TEST_SECRET_REF = "resolved-from-env";

    expect(resolveSecretReference("env:TEST_SECRET_REF", "Тестовый секрет")).toBe("resolved-from-env");

    const encrypted = encryptSecret("encrypted-bind-password");
    expect(resolveSecretReference(encrypted, "Тестовый секрет")).toBe("encrypted-bind-password");
  });

  it("fails closed on missing env values and unsupported vault references", () => {
    delete process.env.MISSING_SECRET_REF;

    expect(() => resolveSecretReference("env:MISSING_SECRET_REF", "Bind-секрет LDAPS")).toThrow(
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

    expect(() => assertSupportedSecretReference("env:QC_AD_BIND_PASSWORD", "Bind-секрет LDAPS")).not.toThrow();
    expect(() => assertSupportedSecretReference(encrypted, "Bind-секрет LDAPS")).not.toThrow();
    expect(() => assertSupportedSecretReference("vault:qc/ad/bind-password", "Bind-секрет LDAPS")).toThrow(/vault:\/secret:/);
    expect(() => assertSupportedSecretReference("inline-password", "Bind-секрет LDAPS")).toThrow(/env:- или зашифрованной v1:/);

    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertProductionSecretReference("env:OIDC_SECRET")).not.toThrow();
    expect(() => assertProductionSecretReference(encrypted)).not.toThrow();
    expect(() => assertProductionSecretReference("inline-secret")).toThrow(/production/);
    expect(() => assertProductionSecretReference("vault:qc/oidc/secret")).toThrow(/vault:\/secret:/);
    expect(() => assertProductionSecretReference("secret:qc/oidc/secret")).toThrow(/vault:\/secret:/);
  });
});
