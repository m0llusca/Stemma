import { redactAuditMetadata } from "@/lib/audit";
import { describe, expect, it } from "vitest";

describe("redactAuditMetadata", () => {
  it("redacts token and secret values recursively", () => {
    expect(
      redactAuditMetadata({
        apiToken: "plain-token",
        clientSecretRef: "env:OIDC_SECRET",
        nested: {
          authorizationHeader: "Bearer secret",
          safeValue: "visible"
        },
        events: [{ password: "hidden" }]
      })
    ).toEqual({
      apiToken: "[redacted]",
      clientSecretRef: "[redacted]",
      nested: {
        authorizationHeader: "[redacted]",
        safeValue: "visible"
      },
      events: [{ password: "[redacted]" }]
    });
  });
});
