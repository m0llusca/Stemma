import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSessionApi, verifySameOrigin } from "@/lib/api/session";

const mocks = vi.hoisted(() => ({
  AuthRequiredError: class AuthRequiredError extends Error {
    constructor() {
      super("Нет активной сессии. Войдите снова, чтобы продолжить.");
      this.name = "AuthRequiredError";
    }
  },
  DemoSettingsMutationError: class DemoSettingsMutationError extends Error {
    constructor() {
      super("Демо-пользователи не могут сохранять настройки реального окружения.");
      this.name = "DemoSettingsMutationError";
    }
  },
  assertCanPersistSettings: vi.fn(),
  requireCurrentUserPermission: vi.fn()
}));

vi.mock("@/lib/current-user", () => ({
  AuthRequiredError: mocks.AuthRequiredError,
  DemoSettingsMutationError: mocks.DemoSettingsMutationError,
  assertCanPersistSettings: mocks.assertCanPersistSettings,
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
    mocks.assertCanPersistSettings.mockResolvedValue(undefined);
  });

  it("allows same-origin state-changing requests", () => {
    expect(verifySameOrigin(request("POST", { origin: "https://qc.example.com" }))).toEqual({ ok: true });
  });

  it("allows same-origin referer fallback when origin is absent", () => {
    expect(verifySameOrigin(request("POST", { referer: "https://qc.example.com/settings/api-tokens" }))).toEqual({
      ok: true
    });
  });

  it("blocks cross-origin state-changing requests", () => {
    expect(verifySameOrigin(request("POST", { origin: "https://evil.example.com" }))).toEqual({
      ok: false,
      message: "Cross-origin request blocked."
    });
  });

  it("requires origin or referer for state-changing requests", () => {
    expect(verifySameOrigin(request("POST"))).toEqual({
      ok: false,
      message: "Origin header is required."
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

  it("maps auth-required errors to structured unauthorized responses", async () => {
    mocks.requireCurrentUserPermission.mockRejectedValue(new mocks.AuthRequiredError());

    const result = await requireSessionApi(request("POST", { origin: "https://qc.example.com" }), "api_tokens:manage", {
      requestId: "req-auth-required"
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toMatchObject({
        error: {
          code: "unauthorized",
          message: "Нет активной сессии. Войдите снова, чтобы продолжить.",
          requestId: "req-auth-required"
        }
      });
    }
  });

  it("maps permission denial errors to structured forbidden responses", async () => {
    mocks.requireCurrentUserPermission.mockRejectedValue(new Error("Недостаточно прав для выполнения операции."));

    const result = await requireSessionApi(request("POST", { origin: "https://qc.example.com" }), "api_tokens:manage", {
      requestId: "req-permission-denied"
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toMatchObject({
        error: {
          code: "forbidden",
          message: "Недостаточно прав для выполнения операции.",
          requestId: "req-permission-denied"
        }
      });
    }
  });

  it("blocks demo users from state-changing settings api requests", async () => {
    mocks.assertCanPersistSettings.mockRejectedValue(new mocks.DemoSettingsMutationError());

    const result = await requireSessionApi(request("POST", { origin: "https://qc.example.com" }), "api_tokens:manage", {
      requestId: "req-demo-settings"
    });

    expect(result.ok).toBe(false);
    expect(mocks.assertCanPersistSettings).toHaveBeenCalledWith({
      id: "user-1",
      workspaceId: "workspace-1",
      role: "ADMIN"
    });

    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toMatchObject({
        error: {
          code: "forbidden",
          message: "Демо-пользователи не могут сохранять настройки реального окружения.",
          requestId: "req-demo-settings"
        }
      });
    }
  });

  it("maps unexpected auth errors to structured internal errors with a generic message", async () => {
    mocks.requireCurrentUserPermission.mockRejectedValue(new Error("database password leaked"));

    const result = await requireSessionApi(request("POST", { origin: "https://qc.example.com" }), "api_tokens:manage", {
      requestId: "req-unexpected-auth-error"
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.response.status).toBe(500);
      await expect(result.response.json()).resolves.toMatchObject({
        error: {
          code: "internal_error",
          message: "Внутренняя ошибка авторизации.",
          requestId: "req-unexpected-auth-error"
        }
      });
    }
  });
});
