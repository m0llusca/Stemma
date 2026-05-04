import { describe, expect, it } from "vitest";
import { apiData, apiError, apiRequestId, requestIdFromHeaders } from "@/lib/api/response";

describe("api response helpers", () => {
  it("uses caller request id when present", () => {
    const headers = new Headers({ "x-request-id": "req-client-1" });

    expect(requestIdFromHeaders(headers)).toBe("req-client-1");
  });

  it("generates a request id when none is present", () => {
    expect(apiRequestId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIdFromHeaders(new Headers())).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("wraps successful v1 data with metadata and request id", async () => {
    const response = apiData(
      { ok: true },
      {
        status: 201,
        requestId: "req-123",
        meta: { page: 1 },
        headers: { "x-custom": "yes" }
      }
    );

    await expect(response.json()).resolves.toEqual({
      data: { ok: true },
      meta: { page: 1 },
      requestId: "req-123"
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe("req-123");
    expect(response.headers.get("x-custom")).toBe("yes");
  });

  it("wraps v1 errors with code, message, details and request id", async () => {
    const response = apiError("bad_request", "Invalid payload.", 400, "req-456", {
      fieldErrors: { name: ["Required"] }
    });

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "bad_request",
        message: "Invalid payload.",
        details: { fieldErrors: { name: ["Required"] } },
        requestId: "req-456"
      }
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("x-request-id")).toBe("req-456");
  });
});
