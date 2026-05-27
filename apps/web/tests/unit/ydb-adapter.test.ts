import { describe, expect, it, vi } from "vitest";

const close = vi.fn();
const ready = vi.fn().mockResolvedValue(undefined);
const queryFn = vi.fn().mockResolvedValue([
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
]);
const driverConstructor = vi.fn().mockImplementation(() => ({ ready, close }));
const unsafe = vi.fn((value: string) => value);
const staticCredentialsProvider = vi.fn().mockImplementation((value) => value);

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

  it("closes the driver when query execution fails", async () => {
    vi.clearAllMocks();
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
});
