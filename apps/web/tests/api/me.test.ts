import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AuthRequiredError: class AuthRequiredError extends Error {
    constructor() {
      super("Нет активной сессии. Войдите снова, чтобы продолжить.");
      this.name = "AuthRequiredError";
    }
  },
  getCurrentUser: vi.fn()
}));

vi.mock("@/lib/current-user", () => ({
  AuthRequiredError: mocks.AuthRequiredError,
  getCurrentUser: mocks.getCurrentUser
}));

function meRequest() {
  return new Request("https://qc.example.test/api/v1/me", {
    headers: { "x-request-id": "req-me" }
  });
}

describe("GET /api/v1/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a structured 401 for unauthenticated requests", async () => {
    const { GET } = await import("@/app/api/v1/me/route");
    mocks.getCurrentUser.mockRejectedValue(new mocks.AuthRequiredError());

    const response = await GET(meRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get("x-request-id")).toBe("req-me");
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "unauthorized",
        message: "Нет активной сессии. Войдите снова, чтобы продолжить.",
        requestId: "req-me"
      }
    });
  });

  it("returns the current user with role permissions when authenticated", async () => {
    const { GET } = await import("@/app/api/v1/me/route");
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      workspace: { name: "Demo Support QA" },
      email: "agent@example.com",
      name: "Оператор",
      role: "SUPPORT_AGENT",
      supportLine: "L1",
      teamName: "Team A"
    });

    const response = await GET(meRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      id: "user-1",
      workspaceId: "workspace-1",
      workspaceName: "Demo Support QA",
      role: "SUPPORT_AGENT"
    });
    expect(body.permissions).toContain("reviews:read");
    expect(body.permissions).not.toContain("reports:manage");
  });
});
