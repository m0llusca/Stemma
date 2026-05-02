import {
  nativeHelpdeskImportExamples,
  nativeHelpdeskSources,
  normalizeNativeHelpdeskPayload,
  type NativeHelpdeskSource
} from "@/lib/normalizers/native-helpdesk";
import { customConversationSchema } from "@/lib/validation/custom-api";
import { describe, expect, it } from "vitest";

describe("native helpdesk normalizer", () => {
  it("normalizes all supported native helpdesk examples into custom conversations", () => {
    for (const source of nativeHelpdeskSources) {
      const conversations = normalizeNativeHelpdeskPayload(nativeHelpdeskImportExamples[source.value], {
        source: source.value
      });

      expect(conversations).toHaveLength(1);
      expect(conversations[0]?.externalSource).toBe(source.value);
      expect(conversations[0]?.messages.length).toBeGreaterThan(0);
      expect(() => customConversationSchema.parse(conversations[0])).not.toThrow();
    }
  });

  it("preserves source-specific support semantics", () => {
    const zendesk = normalizeNativeHelpdeskPayload(nativeHelpdeskImportExamples.zendesk, { source: "zendesk" })[0];
    const intercom = normalizeNativeHelpdeskPayload(nativeHelpdeskImportExamples.intercom, { source: "intercom" })[0];
    const freshdesk = normalizeNativeHelpdeskPayload(nativeHelpdeskImportExamples.freshdesk, { source: "freshdesk" })[0];
    const hubspot = normalizeNativeHelpdeskPayload(nativeHelpdeskImportExamples.hubspot, { source: "hubspot" })[0];

    expect(zendesk?.channel).toBe("email");
    expect(zendesk?.riskHint).toContain("Priority");
    expect(intercom?.channel).toBe("messenger");
    expect(freshdesk?.status).toBe("resolved");
    expect(hubspot?.tags).toContain("HIGH");
  });

  it("returns no conversations for unsupported payload shapes", () => {
    expect(normalizeNativeHelpdeskPayload({ source: "zendesk", hello: "world" }, { source: "zendesk" as NativeHelpdeskSource })).toEqual([]);
  });
});
