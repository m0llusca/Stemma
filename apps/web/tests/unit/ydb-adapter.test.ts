import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Integration, IntegrationCredential } from "@prisma/client";
import { encryptSecret } from "@/lib/secrets";

type IntegrationWithCredentials = Integration & {
  credentials: IntegrationCredential[];
};

const close = vi.fn();
const ready = vi.fn();
const ydbRows = [
  [
    {
      conversation_id: "ydb-conv-1",
      message_id: "ydb-msg-1",
      author_name: "Анна",
      participant_type: "customer",
      body: "Нужен возврат из YDB.",
      sent_at: "2026-04-25T10:00:00Z",
      subject: "YDB refund",
      customer_name: "Анна"
    }
  ]
];
const queryFn = vi.fn();
const driverConstructor = vi.fn().mockImplementation(() => ({ ready, close }));
const unsafe = vi.fn((value: string) => value);
const staticCredentialsProvider = vi.fn().mockImplementation((value) => value);
const now = new Date("2026-05-09T08:00:00.000Z");

function credential(kind: string, secret: string): IntegrationCredential {
  return {
    id: `${kind}-credential`,
    workspaceId: "workspace-1",
    integrationId: "integration-1",
    kind,
    authMode: "static_credentials",
    encryptedSecret: encryptSecret(secret),
    keyVersion: "v1",
    fingerprint: null,
    lastRotatedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function integration(overrides: Partial<IntegrationWithCredentials> = {}): IntegrationWithCredentials {
  return {
    id: "integration-1",
    workspaceId: "workspace-1",
    source: "ydb",
    displayName: "YDB",
    type: "data_source",
    status: "ready",
    baseUrl: "grpc://localhost:2136/local",
    configJson: JSON.stringify({ query: "SELECT * FROM conversations" }),
    syncStateJson: "{}",
    authMode: "static_credentials",
    importLimit: 100,
    batchSize: 25,
    dateRangeDays: 30,
    schedule: null,
    syncCursor: null,
    lastSyncedAt: null,
    lastDryRunAt: null,
    lastImportAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    credentials: [credential("data_source_credentials", JSON.stringify({ username: "user", password: "pass" }))],
    ...overrides
  };
}

vi.mock("@ydbjs/core", () => ({
  Driver: driverConstructor
}));

vi.mock("@ydbjs/query", () => ({
  query: vi.fn(() => queryFn),
  unsafe
}));

vi.mock("@ydbjs/auth/static", () => ({
  StaticCredentialsProvider: staticCredentialsProvider
}));

describe("YDB adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ready.mockResolvedValue(undefined);
    queryFn.mockResolvedValue(ydbRows);
    driverConstructor.mockImplementation(() => ({ ready, close }));
  });

  it("executes a configured query and closes the driver", async () => {
    const { createYdbAdapter } = await import("@/lib/integrations/data-source-adapters/ydb");
    const result = await createYdbAdapter().loadRows({
      source: "ydb",
      baseUrl: "grpc://localhost:2136/local",
      config: { query: "SELECT * FROM conversations LIMIT 100" },
      credential: JSON.stringify({ username: "user", password: "pass" }),
      limit: 100
    });

    expect(result.conversations[0]).toMatchObject({
      externalSource: "ydb",
      externalId: "ydb-conv-1"
    });
    expect(staticCredentialsProvider).toHaveBeenCalledWith(
      { username: "user", password: "pass" },
      "grpc://localhost:2136/local"
    );
    expect(driverConstructor).toHaveBeenCalledWith("grpc://localhost:2136/local", {
      credentialsProvider: { username: "user", password: "pass" }
    });
    expect(unsafe).toHaveBeenCalledWith("SELECT * FROM conversations LIMIT 100");
    expect(ready).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("redacts YDB URL credentials from diagnostics", async () => {
    const { createYdbAdapter } = await import("@/lib/integrations/data-source-adapters/ydb");
    const result = await createYdbAdapter().loadRows({
      source: "ydb",
      baseUrl: "grpcs://db-user:secret-pass@ydb.example.com/local",
      config: { query: "SELECT * FROM conversations LIMIT 100" },
      credential: JSON.stringify({ username: "user", password: "pass" }),
      limit: 100
    });

    expect(JSON.stringify(result.diagnostics)).not.toContain("db-user");
    expect(JSON.stringify(result.diagnostics)).not.toContain("secret-pass");
    expect(result.diagnostics.requests[0]?.url).toContain("ydb.example.com");
  });

  it("builds a constrained read query from tablePath and applies the input limit server-side", async () => {
    const { createYdbAdapter } = await import("@/lib/integrations/data-source-adapters/ydb");

    await createYdbAdapter().loadRows({
      source: "ydb",
      baseUrl: "grpc://localhost:2136/local",
      config: { tablePath: "/local/conversations" },
      credential: JSON.stringify({ username: "user", password: "pass" }),
      limit: 25
    });

    expect(unsafe).toHaveBeenCalledWith("SELECT * FROM `/local/conversations` LIMIT 25");
  });

  it("rejects mutation YQL before opening the driver", async () => {
    const { createYdbAdapter } = await import("@/lib/integrations/data-source-adapters/ydb");

    await expect(
      createYdbAdapter().loadRows({
        source: "ydb",
        baseUrl: "grpc://localhost:2136/local",
        config: { query: "UPSERT INTO conversations (id) VALUES (1)" },
        credential: JSON.stringify({ username: "user", password: "pass" }),
        limit: 100
      })
    ).rejects.toThrow("YDB query должен быть read-only SELECT/WITH SELECT.");

    expect(driverConstructor).not.toHaveBeenCalled();
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("rejects trailing line comments that can swallow the enforced limit", async () => {
    const { createYdbAdapter } = await import("@/lib/integrations/data-source-adapters/ydb");

    await expect(
      createYdbAdapter().loadRows({
        source: "ydb",
        baseUrl: "grpc://localhost:2136/local",
        config: { query: "SELECT * FROM conversations LIMIT 100000 --" },
        credential: JSON.stringify({ username: "user", password: "pass" }),
        limit: 25
      })
    ).rejects.toThrow("YDB query должен быть read-only SELECT/WITH SELECT.");

    expect(driverConstructor).not.toHaveBeenCalled();
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("appends a server-side limit to read-only queries without one", async () => {
    const { createYdbAdapter } = await import("@/lib/integrations/data-source-adapters/ydb");

    await createYdbAdapter().loadRows({
      source: "ydb",
      baseUrl: "grpc://localhost:2136/local",
      config: { query: "SELECT * FROM conversations" },
      credential: JSON.stringify({ username: "user", password: "pass" }),
      limit: 25
    });

    expect(unsafe).toHaveBeenCalledWith("SELECT * FROM conversations LIMIT 25");
  });

  it("enforces the input limit when the query asks for a higher limit", async () => {
    const { createYdbAdapter } = await import("@/lib/integrations/data-source-adapters/ydb");

    await createYdbAdapter().loadRows({
      source: "ydb",
      baseUrl: "grpc://localhost:2136/local",
      config: { query: "SELECT * FROM conversations LIMIT 500" },
      credential: JSON.stringify({ username: "user", password: "pass" }),
      limit: 25
    });

    expect(unsafe).toHaveBeenCalledWith("SELECT * FROM conversations LIMIT 25");
  });

  it("times out slow YDB queries and still closes the driver", async () => {
    queryFn.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(ydbRows), 30)));
    const { createYdbAdapter } = await import("@/lib/integrations/data-source-adapters/ydb");

    await expect(
      createYdbAdapter().loadRows({
        source: "ydb",
        baseUrl: "grpc://localhost:2136/local",
        config: { query: "SELECT * FROM conversations" },
        credential: JSON.stringify({ username: "user", password: "pass" }),
        limit: 100,
        timeoutMs: 1
      })
    ).rejects.toThrow("YDB query timed out.");

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized YDB result rows and still closes the driver", async () => {
    queryFn.mockResolvedValueOnce([
      [
        {
          conversation_id: "ydb-conv-large",
          body: "x".repeat(128)
        }
      ]
    ]);
    const { createYdbAdapter } = await import("@/lib/integrations/data-source-adapters/ydb");

    await expect(
      createYdbAdapter().loadRows({
        source: "ydb",
        baseUrl: "grpc://localhost:2136/local",
        config: { query: "SELECT * FROM conversations" },
        credential: JSON.stringify({ username: "user", password: "pass" }),
        limit: 100,
        maxResponseBytes: 40
      })
    ).rejects.toThrow("Ответ YDB превышает лимит размера.");

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes the driver when query execution fails", async () => {
    queryFn.mockRejectedValueOnce(new Error("query failed"));
    const { createYdbAdapter } = await import("@/lib/integrations/data-source-adapters/ydb");

    await expect(
      createYdbAdapter().loadRows({
        source: "ydb",
        baseUrl: "grpc://localhost:2136/local",
        config: { query: "SELECT * FROM conversations LIMIT 100" },
        credential: JSON.stringify({ username: "user", password: "pass" }),
        limit: 100
      })
    ).rejects.toThrow("query failed");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rejects empty normalized results unless connectivityOnly is explicit", async () => {
    queryFn.mockResolvedValueOnce([[]]);
    const { loadDataSourceAdapterConversations } = await import("@/lib/integrations/data-source-adapters/service");

    await expect(
      loadDataSourceAdapterConversations({
        integration: integration(),
        limit: 25
      })
    ).rejects.toThrow("Источник данных не вернул обращения в поддерживаемом формате.");

    queryFn.mockResolvedValueOnce([[]]);
    await expect(
      loadDataSourceAdapterConversations({
        integration: integration({
          configJson: JSON.stringify({ query: "SELECT * FROM conversations", connectivityOnly: true })
        }),
        limit: 25
      })
    ).resolves.toMatchObject({
      source: "ydb",
      rows: [],
      conversations: []
    });
  });
});
