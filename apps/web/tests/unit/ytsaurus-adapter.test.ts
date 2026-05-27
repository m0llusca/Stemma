import { describe, expect, it } from "vitest";
import { createYTsaurusAdapter } from "@/lib/integrations/data-source-adapters/ytsaurus";
import { createYTsaurusServer } from "../fixtures/ytsaurus-server";

describe("YTsaurus adapter", () => {
  it("reads a table and normalizes rows", async () => {
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
      expect(server.requests[0]?.query.path).toBe("//home/qc/conversations");
      expect(JSON.stringify(result.diagnostics)).not.toContain("yt-token");
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
