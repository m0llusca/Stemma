import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionApi: vi.fn(),
  buildOpenApiDocument: vi.fn()
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/api/openapi", () => ({
  buildOpenApiDocument: mocks.buildOpenApiDocument
}));

function request() {
  return new Request("https://qc.example.com/api/v1/openapi", {
    headers: { "x-request-id": "req-openapi" }
  });
}

describe("openapi API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.buildOpenApiDocument.mockReturnValue({ openapi: "3.1.0", info: { title: "test" } });
    mocks.requireSessionApi.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 })
    });
  });

  it("stays public in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { GET } = await import("@/app/api/v1/openapi/route");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ openapi: "3.1.0", info: { title: "test" } });
    expect(mocks.requireSessionApi).not.toHaveBeenCalled();
  });

  it("returns 404 in production without manage session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("@/app/api/v1/openapi/route");

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(mocks.requireSessionApi).toHaveBeenCalledWith(expect.any(Request), "backend_jobs:manage", {
      requestId: "req-openapi"
    });
    expect(mocks.buildOpenApiDocument).not.toHaveBeenCalled();
  });

  it("serves the document in production for manage session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.requireSessionApi.mockResolvedValue({
      ok: true,
      user: { id: "admin-1", workspaceId: "workspace-1", role: "ADMIN" }
    });
    const { GET } = await import("@/app/api/v1/openapi/route");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.openapi).toBe("3.1.0");
    expect(mocks.buildOpenApiDocument).toHaveBeenCalled();
  });
});
