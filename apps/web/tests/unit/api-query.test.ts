import { describe, expect, it } from "vitest";
import { enumParam, firstQueryParam, paginationMeta, parseIsoDateParam, parsePagination, safeJsonParse, splitTags } from "@/lib/api/query";

describe("api query helpers", () => {
  it("normalizes pagination within configured limits", () => {
    expect(parsePagination({ page: "2", limit: "500", defaultLimit: 25, maxLimit: 100 })).toEqual({
      page: 2,
      limit: 100,
      skip: 100
    });
    expect(parsePagination({ page: "bad", limit: "-1", defaultLimit: 25, maxLimit: 100 })).toEqual({
      page: 1,
      limit: 25,
      skip: 0
    });
    expect(paginationMeta({ page: 2, limit: 10, total: 25 })).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true
    });
  });

  it("parses common query values safely", () => {
    const params = new URLSearchParams("q=%20refund%20&from=2026-05-01&to=2026-05-03&broken={");

    expect(firstQueryParam(params, "q")).toBe("refund");
    expect(parseIsoDateParam(params, "from")?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(parseIsoDateParam(params, "to", true)?.toISOString()).toBe("2026-05-03T23:59:59.999Z");
    expect(safeJsonParse(params.get("broken"))).toEqual({});
    expect(safeJsonParse('{"ok":true}')).toEqual({ ok: true });
  });

  it("validates enum params case-insensitively and rejects unknown values", () => {
    const params = new URLSearchParams("status=draft&unknown=BROKEN");

    expect(enumParam(params, "status", ["DRAFT", "FINALIZED"] as const)).toEqual({ ok: true, value: "DRAFT" });
    expect(enumParam(params, "missing", ["DRAFT", "FINALIZED"] as const)).toEqual({ ok: true, value: undefined });
    expect(enumParam(params, "unknown", ["DRAFT", "FINALIZED"] as const)).toEqual({ ok: false, value: "BROKEN" });
  });

  it("splits comma-separated tags and drops empty entries", () => {
    expect(splitTags("vip, refund , ,billing")).toEqual(["vip", "refund", "billing"]);
    expect(splitTags("")).toEqual([]);
  });
});
