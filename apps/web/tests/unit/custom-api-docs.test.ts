import {
  buildCurlExample,
  apiTokenPlaceholder,
  customApiEndpoints,
  customConversationExample,
  customMessageExample
} from "@/lib/custom-api-docs";
import { customConversationSchema, customMessageSchema } from "@/lib/validation/custom-api";
import { describe, expect, it } from "vitest";

describe("custom API onboarding docs", () => {
  it("keeps the documented conversation example valid", () => {
    expect(() => customConversationSchema.parse(customConversationExample)).not.toThrow();
  });

  it("keeps the documented message example valid", () => {
    expect(() => customMessageSchema.parse(customMessageExample)).not.toThrow();
  });

  it("documents the required custom API scopes", () => {
    expect(customApiEndpoints.map((endpoint) => endpoint.scope)).toEqual([
      "conversations:write",
      "conversations:write",
      "conversations:write",
      "reviews:read"
    ]);
    expect(customApiEndpoints.map((endpoint) => endpoint.path)).toContain("/api/integrations/otrs-family/tickets");
  });

  it("generates curl examples with bearer authentication", () => {
    expect(buildCurlExample("/api/conversations", "POST", customConversationExample)).toContain(
      `Authorization: Bearer ${apiTokenPlaceholder}`
    );
  });
});
