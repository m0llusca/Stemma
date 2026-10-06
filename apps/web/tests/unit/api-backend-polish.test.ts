import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionApi: vi.fn(),
  auditLog: vi.fn(),
  queueSelectedOtrsImportJob: vi.fn(),
  createOtrsPreview: vi.fn(),
  prisma: {
    apiToken: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    idempotencyKey: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn()
    },
    integration: {
      findFirst: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/integration-import-service", () => ({
  queueSelectedOtrsImportJob: mocks.queueSelectedOtrsImportJob
}));

vi.mock("@/lib/integrations/otrs-family/service", () => ({
  createOtrsPreview: mocks.createOtrsPreview
}));

function authedSession() {
  mocks.requireSessionApi.mockResolvedValue({
    ok: true,
    user: { id: "user-1", workspaceId: "workspace-1" }
  });
}

describe("idempotency key reservation expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 1 });
  });

  const input = {
    workspaceId: "workspace-1",
    key: "key-1",
    method: "POST",
    path: "/api/v1/conversations",
    requestHash: "hash-1"
  };

  it("grants only one concurrent retry ownership of a failed request", async () => {
    const { reserveIdempotencyKey } = await import("@/lib/api/idempotency");
    let record = {
      id: "reservation-1", status: "FAILED", requestHash: "hash-1", method: "POST",
      path: input.path, expiresAt: new Date(Date.now() + 60_000), responseStatus: 500, responseBodyJson: "{}"
    };
    mocks.prisma.idempotencyKey.findUnique.mockImplementation(async () => ({ ...record }));
    mocks.prisma.idempotencyKey.updateMany.mockImplementation(async () => {
      if (record.status !== "FAILED") return { count: 0 };
      record = { ...record, status: "IN_PROGRESS" };
      return { count: 1 };
    });

    const results = await Promise.all([reserveIdempotencyKey(input), reserveIdempotencyKey(input)]);

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results.filter((result) => result.isInProgress)).toHaveLength(1);
    expect(results.find((result) => result.created)?.record).toMatchObject({
      status: "IN_PROGRESS", responseStatus: null, responseBodyJson: null
    });
    expect(results.find((result) => result.created)?.record.expiresAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
  });

  it("rejects a changed payload without reclaiming the failed reservation", async () => {
    const { reserveIdempotencyKey } = await import("@/lib/api/idempotency");
    mocks.prisma.idempotencyKey.findUnique.mockResolvedValue({
      id: "reservation-1", status: "FAILED", requestHash: "different-hash", method: input.method,
      path: input.path, expiresAt: new Date(Date.now() + 60_000)
    });
    const result = await reserveIdempotencyKey(input);
    expect(result.isConflict).toBe(true);
    expect(mocks.prisma.idempotencyKey.updateMany).not.toHaveBeenCalled();
  });

  it("replaces an expired reservation instead of reporting a replay", async () => {
    const { reserveIdempotencyKey } = await import("@/lib/api/idempotency");
    mocks.prisma.idempotencyKey.findUnique.mockResolvedValue({
      id: "reservation-1",
      status: "COMPLETED",
      requestHash: "hash-1",
      method: "POST",
      path: "/api/v1/conversations",
      expiresAt: new Date(Date.now() - 1000)
    });
    mocks.prisma.idempotencyKey.create.mockResolvedValue({ id: "reservation-2" });

    const reservation = await reserveIdempotencyKey(input);

    expect(mocks.prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { id: "reservation-1", expiresAt: { lte: expect.any(Date) } }
    });
    expect(mocks.prisma.idempotencyKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        key: "key-1",
        requestHash: "hash-1",
        expiresAt: expect.any(Date)
      })
    });
    expect(reservation).toEqual({
      created: true,
      record: { id: "reservation-2" },
      isReplay: false,
      isInProgress: false,
      isConflict: false
    });
  });

  it("does not delete an expired row that another retry has already renewed", async () => {
    const { reserveIdempotencyKey } = await import("@/lib/api/idempotency");
    const record = { id: "reservation-1", status: "FAILED", requestHash: input.requestHash,
      method: input.method, path: input.path, expiresAt: new Date(Date.now() - 1000) };
    mocks.prisma.idempotencyKey.findUnique.mockResolvedValueOnce(record).mockResolvedValueOnce({
      ...record, status: "IN_PROGRESS", expiresAt: new Date(Date.now() + 60_000)
    });
    mocks.prisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 0 });
    const result = await reserveIdempotencyKey(input);
    expect(result.isInProgress).toBe(true);
    expect(mocks.prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it("keeps replay semantics for a live reservation", async () => {
    const { reserveIdempotencyKey } = await import("@/lib/api/idempotency");
    mocks.prisma.idempotencyKey.findUnique.mockResolvedValue({
      id: "reservation-1",
      status: "COMPLETED",
      requestHash: "hash-1",
      method: "POST",
      path: "/api/v1/conversations",
      expiresAt: new Date(Date.now() + 60_000)
    });

    const reservation = await reserveIdempotencyKey(input);

    expect(reservation.created).toBe(false);
    expect(reservation.isReplay).toBe(true);
    expect(mocks.prisma.idempotencyKey.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });
});

describe("api token lastUsedAt throttling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  function request() {
    return new Request("http://localhost/api/v1/conversations", {
      headers: { authorization: "Bearer plain-token" }
    }) as never;
  }

  function mockToken(lastUsedAt: Date | null) {
    mocks.prisma.apiToken.findUnique.mockResolvedValue({
      id: "token-1",
      workspaceId: "workspace-1",
      scopes: "all",
      expiresAt: null,
      lastUsedAt
    });
  }

  it("updates lastUsedAt when the token was never used", async () => {
    const { requireApiToken } = await import("@/lib/api-auth");
    mockToken(null);

    const auth = await requireApiToken(request(), "conversations:read");

    expect(auth.ok).toBe(true);
    expect(mocks.prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: { lastUsedAt: expect.any(Date) }
    });
  });

  it("skips the write when lastUsedAt is fresher than 60 seconds", async () => {
    const { requireApiToken } = await import("@/lib/api-auth");
    mockToken(new Date(Date.now() - 30_000));

    const auth = await requireApiToken(request(), "conversations:read");

    expect(auth).toEqual({ ok: true, workspaceId: "workspace-1", apiTokenId: "token-1" });
    expect(mocks.prisma.apiToken.update).not.toHaveBeenCalled();
  });

  it("updates lastUsedAt again once it is older than 60 seconds", async () => {
    const { requireApiToken } = await import("@/lib/api-auth");
    mockToken(new Date(Date.now() - 61_000));

    const auth = await requireApiToken(request(), "conversations:read");

    expect(auth.ok).toBe(true);
    expect(mocks.prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: { lastUsedAt: expect.any(Date) }
    });
  });
});

describe("integration import/preview payload limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authedSession();
  });

  const context = { params: Promise.resolve({ integrationId: "integration-1" }) };

  function importRequest(itemIds: string[]) {
    return new Request("https://qc.example.test/api/v1/integrations/integration-1/import", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "req-import" },
      body: JSON.stringify({ integrationRunId: "run-1", integrationRunItemIds: itemIds })
    });
  }

  it("rejects selective imports with more than 500 items", async () => {
    const { POST } = await import("@/app/api/v1/integrations/[integrationId]/import/route");
    const itemIds = Array.from({ length: 501 }, (_, index) => `item-${index}`);

    const response = await POST(importRequest(itemIds), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "bad_request", requestId: "req-import" }
    });
    expect(mocks.prisma.integration.findFirst).not.toHaveBeenCalled();
    expect(mocks.queueSelectedOtrsImportJob).not.toHaveBeenCalled();
  });

  it("accepts selective imports at the 500 item boundary", async () => {
    const { POST } = await import("@/app/api/v1/integrations/[integrationId]/import/route");
    const itemIds = Array.from({ length: 500 }, (_, index) => `item-${index}`);
    mocks.prisma.integration.findFirst.mockResolvedValue({ id: "integration-1" });
    mocks.queueSelectedOtrsImportJob.mockResolvedValue({
      run: { id: "run-1", status: "QUEUED", requestedLimit: 500 },
      job: { id: "job-1", status: "QUEUED" }
    });

    const response = await POST(importRequest(itemIds), context);

    expect(response.status).toBe(202);
    expect(mocks.queueSelectedOtrsImportJob).toHaveBeenCalledWith(
      expect.objectContaining({ integrationRunItemIds: itemIds })
    );
  });

  it("rejects manual previews with more than 500 ticket ids", async () => {
    const { POST } = await import("@/app/api/v1/integrations/[integrationId]/preview/route");
    const manualTicketIds = Array.from({ length: 501 }, (_, index) => `ticket-${index}`);

    const response = await POST(
      new Request("https://qc.example.test/api/v1/integrations/integration-1/preview", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "req-preview" },
        body: JSON.stringify({ mode: "manual_ticket_ids", manualTicketIds })
      }),
      context
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "bad_request", requestId: "req-preview" }
    });
    expect(mocks.createOtrsPreview).not.toHaveBeenCalled();
  });
});
