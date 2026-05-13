import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionApi: vi.fn(),
  listIntegrationCapabilities: vi.fn()
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/integrations/capabilities", () => ({
  listIntegrationCapabilities: mocks.listIntegrationCapabilities
}));

describe("integration catalog route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireSessionApi.mockReset();
    mocks.listIntegrationCapabilities.mockReset();
  });

  it("returns structured auth failures from requireSessionApi", async () => {
    const { GET } = await import("@/app/api/v1/integrations/catalog/route");
    const authResponse = Response.json(
      {
        error: {
          code: "unauthorized",
          message: "Нет активной пользовательской сессии.",
          details: null,
          requestId: "req-catalog"
        }
      },
      {
        status: 401,
        headers: { "x-request-id": "req-catalog" }
      }
    );
    mocks.requireSessionApi.mockResolvedValue({
      ok: false,
      response: authResponse
    });

    const response = await GET(
      new Request("https://qc.example.test/api/v1/integrations/catalog", {
        headers: { "x-request-id": "req-catalog" }
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "unauthorized",
        message: "Нет активной пользовательской сессии.",
        details: null,
        requestId: "req-catalog"
      }
    });
    expect(mocks.requireSessionApi).toHaveBeenCalledWith(expect.any(Request), "integrations:manage", {
      requestId: "req-catalog"
    });
    expect(mocks.listIntegrationCapabilities).not.toHaveBeenCalled();
  });

  it("returns integration capabilities with certification metadata and request id", async () => {
    const catalog = [
      {
        source: "custom_api",
        displayName: "Custom API",
        certification: {
          summary: {
            status: "live_certified",
            label: "Живая сертификация пройдена",
            productionReady: true
          }
        }
      }
    ];
    mocks.requireSessionApi.mockResolvedValue({
      ok: true,
      session: { user: { id: "user-1" } }
    });
    mocks.listIntegrationCapabilities.mockReturnValue(catalog);
    const { GET } = await import("@/app/api/v1/integrations/catalog/route");

    const response = await GET(
      new Request("https://qc.example.test/api/v1/integrations/catalog", {
        headers: { "x-request-id": "req-catalog" }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      catalog,
      requestId: "req-catalog"
    });
    expect(mocks.requireSessionApi).toHaveBeenCalledWith(expect.any(Request), "integrations:manage", {
      requestId: "req-catalog"
    });
    expect(mocks.listIntegrationCapabilities).toHaveBeenCalledTimes(1);
  });
});
