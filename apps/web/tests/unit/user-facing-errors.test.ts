import { describe, expect, it } from "vitest";
import {
  parseApiErrorPayload,
  permissionDeniedMessage,
  sessionRequiredMessage,
  userFacingApiErrorMessage
} from "@/lib/api/user-facing-errors";

describe("userFacingApiErrorMessage", () => {
  it("distinguishes 401 session loss from 403 permission denial", () => {
    expect(userFacingApiErrorMessage({ status: 401 })).toBe(sessionRequiredMessage);
    expect(userFacingApiErrorMessage({ status: 403 })).toBe(permissionDeniedMessage);
    expect(userFacingApiErrorMessage({ code: "unauthorized" })).toBe(sessionRequiredMessage);
    expect(userFacingApiErrorMessage({ code: "forbidden" })).toBe(permissionDeniedMessage);
    expect(sessionRequiredMessage).not.toBe(permissionDeniedMessage);
    expect(sessionRequiredMessage).toMatch(/сессии/i);
    expect(permissionDeniedMessage).toMatch(/прав/i);
  });

  it("prefers structured API codes over ambiguous upstream text", () => {
    expect(
      userFacingApiErrorMessage({
        status: 401,
        code: "unauthorized",
        message: "Something went wrong"
      })
    ).toBe(sessionRequiredMessage);
  });

  it("falls back to payload message for non-auth errors", () => {
    expect(
      userFacingApiErrorMessage({
        status: 409,
        message: "Конфликт записи."
      })
    ).toBe("Конфликт записи.");
  });

  it("parses nested apiError envelopes", () => {
    expect(
      parseApiErrorPayload({
        error: { code: "forbidden", message: permissionDeniedMessage, requestId: "r1" }
      })
    ).toEqual({ code: "forbidden", message: permissionDeniedMessage });
  });
});
