import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/secrets";

describe("secret encryption", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips integration credentials without storing plaintext", () => {
    const encrypted = encryptSecret("super-secret-token");

    expect(encrypted).not.toContain("super-secret-token");
    expect(decryptSecret(encrypted)).toBe("super-secret-token");
  });

  it("masks secrets for diagnostics", () => {
    expect(maskSecret("abcdef123456")).toBe("abcd...3456");
    expect(maskSecret("short")).toBe("********");
    expect(maskSecret(null)).toBeNull();
  });

  it("refuses to use the local development fallback secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QC_SECRET_KEY", "");

    expect(() => encryptSecret("super-secret-token")).toThrow("QC_SECRET_KEY");
  });
});
