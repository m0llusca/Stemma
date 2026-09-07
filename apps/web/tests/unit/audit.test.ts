import { redactAuditMetadata, redactJobPayload } from "@/lib/audit";
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

  it("redacts job-oriented sensitive keys", () => {
    expect(
      redactAuditMetadata({
        rawBody: "<xml/>",
        credential: "user:pass",
        apiKey: "k-1",
        api_key: "k-2",
        cookie: "session=1",
        conversationId: "conv-1"
      })
    ).toEqual({
      rawBody: "[redacted]",
      credential: "[redacted]",
      apiKey: "[redacted]",
      api_key: "[redacted]",
      cookie: "[redacted]",
      conversationId: "conv-1"
    });
  });
});

describe("redactJobPayload", () => {
  it("parses JSON and redacts sensitive keys without requiring mutation of the source string", () => {
    const payloadJson = JSON.stringify({
      conversationId: "conv-1",
      accessToken: "secret-token",
      nested: {
        password: "hidden",
        rawBody: "payload-body",
        ok: true
      }
    });

    expect(redactJobPayload(payloadJson)).toEqual({
      conversationId: "conv-1",
      accessToken: "[redacted]",
      nested: {
        password: "[redacted]",
        rawBody: "[redacted]",
        ok: true
      }
    });
    expect(JSON.parse(payloadJson).accessToken).toBe("secret-token");
  });

  it("returns an empty object for invalid JSON", () => {
    expect(redactJobPayload("{not-json")).toEqual({});
  });
});
