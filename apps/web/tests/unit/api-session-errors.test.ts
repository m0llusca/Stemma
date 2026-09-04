import { beforeEach, describe, expect, it, vi } from "vitest";

const permissionDeniedMessage = "Недостаточно прав для выполнения операции.";
const authRequiredMessage = "Нет активной сессии. Войдите снова, чтобы продолжить.";

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
  isDemoAuthEnabled: vi.fn(),
  requireCurrentUserPermission: vi.fn(),
  auditLog: vi.fn(),
  getRuntimeConfigDiagnostics: vi.fn(),
  getPhaseDReadinessReport: vi.fn(),
  assertIntegrationSourceContractSupported: vi.fn(),
  enqueueBackendJob: vi.fn(),
  prisma: {
    backendJob: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    certificationRun: { findMany: vi.fn() },
    identityProvider: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    integration: { count: vi.fn() },
    authSession: { findMany: vi.fn() },
    conversation: { findFirst: vi.fn() },
    review: { findFirst: vi.fn() },
    reviewEvent: { findMany: vi.fn() }
  }
}));

vi.mock("@/lib/current-user", () => ({
  AuthRequiredError: mocks.AuthRequiredError,
  DemoSettingsMutationError: mocks.DemoSettingsMutationError,
  assertCanPersistSettings: mocks.assertCanPersistSettings,
  isDemoAuthEnabled: mocks.isDemoAuthEnabled,
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/runtime-config", () => ({
  getRuntimeConfigDiagnostics: mocks.getRuntimeConfigDiagnostics
}));

vi.mock("@/lib/certification/readiness-report", () => ({
  getPhaseDReadinessReport: mocks.getPhaseDReadinessReport
}));

vi.mock("@/lib/integration-import-service", () => ({
  assertIntegrationSourceContractSupported: mocks.assertIntegrationSourceContractSupported
}));

vi.mock("@/lib/jobs/enqueue", () => ({
  enqueueBackendJob: mocks.enqueueBackendJob
}));

type GuardedGet = (request: Request) => Promise<Response>;

const guardedGetRoutes: Array<{
  name: string;
  url: string;
  permission: string;
  load: () => Promise<GuardedGet>;
}> = [
  {
    name: "readiness",
    url: "https://qc.example.com/api/v1/readiness",
    permission: "backend_jobs:manage",
    load: async () => (await import("@/app/api/v1/readiness/route")).GET
  },
  {
    name: "jobs list",
    url: "https://qc.example.com/api/v1/jobs",
    permission: "backend_jobs:manage",
    load: async () => (await import("@/app/api/v1/jobs/route")).GET
  },
  {
    name: "job detail",
    url: "https://qc.example.com/api/v1/jobs/job-1",
    permission: "backend_jobs:manage",
    load: async () => {
      const { GET } = await import("@/app/api/v1/jobs/[jobId]/route");
      return (request) => GET(request, { params: Promise.resolve({ jobId: "job-1" }) });
    }
  },
  {
    name: "auth sessions",
    url: "https://qc.example.com/api/v1/auth/sessions",
    permission: "auth_providers:manage",
    load: async () => (await import("@/app/api/v1/auth/sessions/route")).GET
  },
  {
    name: "auth providers",
    url: "https://qc.example.com/api/v1/auth/providers",
    permission: "auth_providers:manage",
    load: async () => (await import("@/app/api/v1/auth/providers/route")).GET
  },
  {
    name: "auth provider mappings",
    url: "https://qc.example.com/api/v1/auth/providers/provider-1/mappings",
    permission: "auth_providers:manage",
    load: async () => {
      const { GET } = await import("@/app/api/v1/auth/providers/[providerId]/mappings/route");
      return (request) => GET(request, { params: Promise.resolve({ providerId: "provider-1" }) });
    }
  },
  {
    name: "conversation events",
    url: "https://qc.example.com/api/v1/conversations/conversation-1/events",
    permission: "reviews:read",
    load: async () => {
      const { GET } = await import("@/app/api/v1/conversations/[conversationId]/events/route");
      return (request) => GET(request, { params: Promise.resolve({ conversationId: "conversation-1" }) });
    }
  },
  {
    name: "review events",
    url: "https://qc.example.com/api/v1/reviews/review-1/events",
    permission: "reviews:read",
    load: async () => {
      const { GET } = await import("@/app/api/v1/reviews/[reviewId]/events/route");
      return (request) => GET(request, { params: Promise.resolve({ reviewId: "review-1" }) });
    }
  }
];

function getRequest(url: string) {
  return new Request(url, {
    method: "GET",
    headers: {
      "x-request-id": "req-session-errors"
    }
  });
}

describe("v1 session-authenticated GET routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.each(guardedGetRoutes)("$name", (route) => {
    it("returns a structured 401 envelope when the session is missing", async () => {
      mocks.requireCurrentUserPermission.mockRejectedValue(new mocks.AuthRequiredError());

      const GET = await route.load();
      const response = await GET(getRequest(route.url));

      expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith(route.permission);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "unauthorized",
          message: authRequiredMessage,
          requestId: "req-session-errors"
        }
      });
    });

    it("returns a structured 403 envelope when the permission is denied", async () => {
      mocks.requireCurrentUserPermission.mockRejectedValue(new Error(permissionDeniedMessage));

      const GET = await route.load();
      const response = await GET(getRequest(route.url));

      expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith(route.permission);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "forbidden",
          message: permissionDeniedMessage,
          requestId: "req-session-errors"
        }
      });
    });
  });
});
