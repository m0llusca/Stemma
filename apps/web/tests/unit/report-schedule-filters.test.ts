import { describe, expect, it } from "vitest";
import { reportScheduleFilterKeys, validateReportScheduleFiltersJson } from "@/lib/report-schedule-filters";

describe("validateReportScheduleFiltersJson", () => {
  it("treats an empty or whitespace-only value as valid (no filters)", () => {
    expect(validateReportScheduleFiltersJson("")).toEqual({ status: "empty", unknownKeys: [] });
    expect(validateReportScheduleFiltersJson("   \n")).toEqual({ status: "empty", unknownKeys: [] });
  });

  it("accepts all supported canonical and conversation filters without unknown-key warnings", () => {
    expect(validateReportScheduleFiltersJson(JSON.stringify({
      supportLine: "L1", csatBucket: "positive", externalSource: "otrs", assigneeName: "Оператор",
      team: "team-a", source: "otrs", risk: "high_plus", block: "block-a"
    }))).toEqual({
      status: "valid",
      unknownKeys: []
    });
  });

  it("rejects syntactically invalid JSON", () => {
    expect(validateReportScheduleFiltersJson("{not json").status).toBe("invalid");
  });

  it("rejects valid JSON that is not an object (server would silently drop it)", () => {
    expect(validateReportScheduleFiltersJson("[1,2]").status).toBe("invalid");
    expect(validateReportScheduleFiltersJson('"L1"').status).toBe("invalid");
    expect(validateReportScheduleFiltersJson("null").status).toBe("invalid");
    expect(validateReportScheduleFiltersJson("42").status).toBe("invalid");
  });

  it("flags unknown keys as a soft warning without invalidating the JSON", () => {
    const result = validateReportScheduleFiltersJson('{"supportLine":"L1","totallyUnknown":1}');

    expect(result.status).toBe("valid");
    expect(result.unknownKeys).toEqual(["totallyUnknown"]);
  });

  it("keeps the supported key list aligned with queued and scheduled export scope", () => {
    expect(reportScheduleFilterKeys).toEqual([
      "supportLine", "csatBucket", "externalSource", "assigneeName", "team", "source", "risk", "block"
    ]);
  });
});
