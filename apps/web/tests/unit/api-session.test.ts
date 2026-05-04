import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSessionApi, verifySameOrigin } from "@/lib/api/session";

const mocks = vi.hoisted(() => ({
  requireCurrentUserPermission: vi.fn()
}));

vi.mock("@/lib/current-user", () => ({
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

function request(method: string, headers: HeadersInit = {}) {
  return new Request("https://qc.example.com/api/v1/api-tokens", {
    method,
    headers: {
      host: "qc.example.com",
      ...headers
    }
  });
}

describe("session api guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserPermission.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      role: "ADMIN"
    });
  });

  it("allows same-origin state-changing requests", () => {
    expect(verifySameOrigin(request("POST", { origin: "https://qc.example.com" }))).toEqual({ ok: true });
  });

  it("blocks cross-origin state-changing requests", () => {
    expect(verifySameOrigin(request("POST", { origin: "https://evil.example.com" }))).toEqual({
      ok: false,
      message: "Cross-origin request blocked."
    });
  });

  it("does not require origin for GET requests", () => {
    expect(verifySameOrigin(request("GET"))).toEqual({ ok: true });
  });

  it("returns structured forbidden response before loading user on CSRF failure", async () => {
    const result = await requireSessionApi(request("POST", { origin: "https://evil.example.com" }), "api_tokens:manage", {
      requestId: "req-session-1"
    });

    expect(result.ok).toBe(false);
    expect(mocks.requireCurrentUserPermission).not.toHaveBeenCalled();

    if (!result.ok) {
      await expect(result.response.json()).resolves.toMatchObject({
        error: {
          code: "forbidden",
          message: "Cross-origin request blocked.",
          requestId: "req-session-1"
        }
      });
    }
  });
});
