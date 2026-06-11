import { describe, expect, it } from "vitest";
import { redactMetadata, redactText, redactedText } from "@/lib/privacy";

describe("privacy helpers", () => {
  it("redacts text fields without losing object shape", () => {
    expect(redactText("Петр Иванов")).toBe(redactedText);
    expect(
      redactMetadata({
        customerName: "Петр",
        nested: {
          body: "secret",
          status: "closed"
        }
      })
    ).toEqual({
      customerName: redactedText,
      nested: {
        body: redactedText,
        status: "closed"
      }
    });
  });

  it("preserves null and undefined in redactText", () => {
    expect(redactText(null)).toBeNull();
    expect(redactText(undefined)).toBeUndefined();
    expect(redactText("")).toBe("");
  });

  it("keeps numbers, booleans and null untouched under sensitive keys", () => {
    expect(
      redactMetadata({
        customerId: 42,
        phoneVerified: true,
        customerName: null,
        messageCount: 0
      })
    ).toEqual({
      customerId: 42,
      phoneVerified: true,
      customerName: null,
      messageCount: 0
    });
  });

  it("redacts nested string values under sensitive keys", () => {
    expect(
      redactMetadata({
        customer: {
          address: "Москва, ул. Ленина",
          age: 30
        },
        messages: ["привет", 5]
      })
    ).toEqual({
      customer: {
        address: redactedText,
        age: 30
      },
      messages: [redactedText, 5]
    });
  });
});
