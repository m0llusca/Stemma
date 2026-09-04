import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/lib/secrets";
import { resolveSecretReference } from "@/lib/auth/secret-refs";

describe("LDAPS secret reference resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves bind secrets from env and encrypted references", () => {
    process.env.QC_AD_BIND_PASSWORD = "service-account-password";

    expect(resolveSecretReference("env:QC_AD_BIND_PASSWORD", "Bind-секрет LDAPS")).toBe("service-account-password");

    const encrypted = encryptSecret("encrypted-bind-password");
    expect(resolveSecretReference(encrypted, "Bind-секрет LDAPS")).toBe("encrypted-bind-password");
  });

  it("fails closed when bind secret refs are missing or unsupported", () => {
    delete process.env.MISSING_LDAPS_BIND_SECRET;

    expect(() => resolveSecretReference(null, "Bind-секрет LDAPS")).toThrow(/не настроен/);
    expect(() => resolveSecretReference("env:MISSING_LDAPS_BIND_SECRET", "Bind-секрет LDAPS")).toThrow(
      /пустую или отсутствующую переменную окружения/
    );
    expect(() => resolveSecretReference("vault:qc/ad/bind-password", "Bind-секрет LDAPS")).toThrow(
      /исполняются только env:- и зашифрованные v1:-ссылки/
    );
    expect(() => resolveSecretReference("secret:qc/ad/bind-password", "Bind-секрет LDAPS")).toThrow(
      /исполняются только env:- и зашифрованные v1:-ссылки/
    );
  });

  it("rejects inline bind secrets in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => resolveSecretReference("raw-bind-password", "Bind-секрет LDAPS")).toThrow(/production/);
  });

  it("resolves CA references through the shared secret resolver", () => {
    process.env.QC_AD_CA_PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

    expect(resolveSecretReference("env:QC_AD_CA_PEM", "LDAPS CA")).toContain("BEGIN CERTIFICATE");
    expect(() => resolveSecretReference("vault:qc/ad/ca", "LDAPS CA")).toThrow(/исполняются только env:- и зашифрованные v1:-ссылки/);
  });
});
