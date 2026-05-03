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
});

