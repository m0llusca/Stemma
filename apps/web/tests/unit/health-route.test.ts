import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionApi: vi.fn(),
  getRuntimeConfigDiagnostics: vi.fn(),
  prisma: {
    $queryRaw: vi.fn()
  }
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/runtime-config", () => ({
  getRuntimeConfigDiagnostics: mocks.getRuntimeConfigDiagnostics
}));

function request() {
  return new Request("https://qc.example.com/api/v1/health", {
    headers: { "x-request-id": "req-health" }
  });
}

describe("health API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mocks.getRuntimeConfigDiagnostics.mockReturnValue({
      status: "ok",
      environment: "test",
      databaseProvider: "postgresql",
      checks: [
        { key: "demo_auth", status: "ok", message: "Демо-авторизация отключена." },
        { key: "ai_scoring", status: "warn", message: "fallback" }
      ]
    });
    mocks.requireSessionApi.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 })
    });
  });

  it("returns minimal public payload in production without manage session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("@/app/api/v1/health/route");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(mocks.requireSessionApi).toHaveBeenCalledWith(expect.any(Request), "backend_jobs:manage", {
      requestId: "req-health"
    });
    expect(mocks.getRuntimeConfigDiagnostics).not.toHaveBeenCalled();
  });

  it("includes runtime diagnostics for authenticated manage session in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.requireSessionApi.mockResolvedValue({
      ok: true,
      user: { id: "admin-1", workspaceId: "workspace-1", role: "ADMIN" }
    });
    const { GET } = await import("@/app/api/v1/health/route");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      service: "support-qa-platform",
      database: "ok",
      runtime: {
        status: "ok",
        databaseProvider: "postgresql"
      }
    });
    expect(body.runtime.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "demo_auth" }), expect.objectContaining({ key: "ai_scoring" })])
    );
    expect(typeof body.latencyMs).toBe("number");
  });

  it("includes diagnostics in non-production without requiring a session", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { GET } = await import("@/app/api/v1/health/route");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireSessionApi).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      status: "ok",
      database: "ok",
      runtime: { status: "ok" }
    });
  });

  it("returns minimal degraded payload in production when the database check fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.prisma.$queryRaw.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/v1/health/route");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: "degraded" });
    expect(mocks.getRuntimeConfigDiagnostics).not.toHaveBeenCalled();
  });
});
