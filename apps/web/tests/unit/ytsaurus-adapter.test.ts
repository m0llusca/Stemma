import { describe, expect, it } from "vitest";
import { createYTsaurusAdapter } from "@/lib/integrations/data-source-adapters/ytsaurus";
import { createYTsaurusServer } from "../fixtures/ytsaurus-server";

describe("YTsaurus adapter", () => {
  it("reads newline-delimited JSON table rows and normalizes them", async () => {
    const server = await createYTsaurusServer({ mode: "success" });

    try {
      const result = await createYTsaurusAdapter().loadRows({
        source: "ytsaurus",
        baseUrl: server.baseUrl,
        config: { tablePath: "//home/qc/conversations" },
        credential: "yt-token",
        limit: 100
      });

      expect(result.conversations[0]).toMatchObject({
        externalSource: "ytsaurus",
        externalId: "yt-conv-1"
      });
      expect(server.requests[0]?.headers.authorization).toBe("OAuth yt-token");
      expect(server.requests[0]?.headers.accept).toBe("application/json");
      expect(server.requests[0]?.headers["x-yt-output-format"]).toBe("json");
      // read_table не имеет параметра limit: ограничение задаётся диапазоном строк в YPath.
      expect(server.requests[0]?.query.path).toBe("//home/qc/conversations[#0:#100]");
      expect(server.requests[0]?.query.limit).toBeUndefined();
      expect(JSON.stringify(result.diagnostics)).not.toContain("yt-token");
    } finally {
      await server.close();
    }
  });

  it("keeps table path secrets out of diagnostics", async () => {
    const server = await createYTsaurusServer({ mode: "success" });

    try {
      const result = await createYTsaurusAdapter().loadRows({
        source: "ytsaurus",
        baseUrl: server.baseUrl,
        config: { tablePath: "//home/qc/secret-segment/conversations" },
        credential: "yt-token",
        limit: 10
      });

      expect(server.requests[0]?.query.path).toBe("//home/qc/secret-segment/conversations[#0:#10]");
      expect(JSON.stringify(result.diagnostics)).not.toContain("secret-segment");
      expect(JSON.stringify(result.diagnostics)).not.toContain("yt-token");
    } finally {
      await server.close();
    }
  });

  it("builds the read_table row range from the requested limit", async () => {
    const server = await createYTsaurusServer({ mode: "success" });

    try {
      await createYTsaurusAdapter().loadRows({
        source: "ytsaurus",
        baseUrl: server.baseUrl,
        config: { tablePath: "//home/qc/conversations" },
        credential: "yt-token",
        limit: 25
      });

      expect(server.requests[0]?.query.path).toBe("//home/qc/conversations[#0:#25]");
      expect(server.requests[0]?.query.limit).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it("respects a YPath that already carries a row range", async () => {
    const server = await createYTsaurusServer({ mode: "success" });

    try {
      await createYTsaurusAdapter().loadRows({
        source: "ytsaurus",
        baseUrl: server.baseUrl,
        config: { tablePath: "//home/qc/conversations[#5:#15]" },
        credential: "yt-token",
        limit: 100
      });

      expect(server.requests[0]?.query.path).toBe("//home/qc/conversations[#5:#15]");
      expect(server.requests[0]?.query.path).not.toContain("[#0:#100]");
      expect(server.requests[0]?.query.limit).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it("reads object responses with a rows array", async () => {
    const server = await createYTsaurusServer({ mode: "rows_object" });

    try {
      const result = await createYTsaurusAdapter().loadRows({
        source: "ytsaurus",
        baseUrl: server.baseUrl,
        config: { tablePath: "//home/qc/conversations" },
        credential: "yt-token",
        limit: 100
      });

      expect(result.rows).toHaveLength(1);
      expect(result.conversations[0]).toMatchObject({
        externalSource: "ytsaurus",
        externalId: "yt-conv-1"
      });
    } finally {
      await server.close();
    }
  });

  it("reads object responses with a values array", async () => {
    const server = await createYTsaurusServer({ mode: "values_object" });

    try {
      const result = await createYTsaurusAdapter().loadRows({
        source: "ytsaurus",
        baseUrl: server.baseUrl,
        config: { tablePath: "//home/qc/conversations" },
        credential: "yt-token",
        limit: 100
      });

      expect(result.rows).toHaveLength(1);
      expect(result.conversations[0]).toMatchObject({
        externalSource: "ytsaurus",
        externalId: "yt-conv-1"
      });
    } finally {
      await server.close();
    }
  });

  it("fails fast when the OAuth token is missing", async () => {
    const server = await createYTsaurusServer({ mode: "success" });

    try {
      await expect(
        createYTsaurusAdapter().loadRows({
          source: "ytsaurus",
          baseUrl: server.baseUrl,
          config: { tablePath: "//home/qc/conversations" },
          limit: 100
        })
      ).rejects.toThrow("Для YTsaurus укажите OAuth token.");

      expect(server.requests).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it("aborts streaming responses when maxResponseBytes is exceeded", async () => {
    const server = await createYTsaurusServer({ mode: "oversized_stream" });

    try {
      await expect(
        createYTsaurusAdapter().loadRows({
          source: "ytsaurus",
          baseUrl: server.baseUrl,
          config: { tablePath: "//home/qc/conversations" },
          credential: "yt-token",
          limit: 100,
          maxResponseBytes: 80
        })
      ).rejects.toThrow("Ответ YTsaurus превышает лимит размера.");

      await Promise.race([
        server.waitForResponseClose(),
        new Promise((resolve) => setTimeout(resolve, 100))
      ]);
      expect(server.closedBeforeEnd).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("rejects unsafe proxy URLs before requests", async () => {
    await expect(
      createYTsaurusAdapter().loadRows({
        source: "ytsaurus",
        baseUrl: "file:///tmp/yt",
        config: { tablePath: "//home/qc/conversations" },
        credential: "yt-token",
        limit: 100
      })
    ).rejects.toThrow("YTsaurus proxy URL должен начинаться с http:// или https://.");
  });
});
