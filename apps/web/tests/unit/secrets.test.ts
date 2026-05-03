import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/secrets";

describe("secret encryption", () => {
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
});

