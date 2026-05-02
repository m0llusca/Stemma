import { redactAuditMetadata } from "@/lib/audit";
import { describe, expect, it } from "vitest";

describe("redactAuditMetadata", () => {
  it("redacts token and secret values recursively", () => {
    expect(
      redactAuditMetadata({
        apiToken: "plain-token",
        nested: {
          authorizationHeader: "Bearer secret",
          safeValue: "visible"
        },
        events: [{ password: "hidden" }]
      })
    ).toEqual({
      apiToken: "[redacted]",
      nested: {
        authorizationHeader: "[redacted]",
        safeValue: "visible"
      },
      events: [{ password: "[redacted]" }]
    });
  });
});
