import { describe, expect, it } from "vitest";
import { reportScheduleFilterKeys, validateReportScheduleFiltersJson } from "@/lib/report-schedule-filters";

describe("validateReportScheduleFiltersJson", () => {
  it("treats an empty or whitespace-only value as valid (no filters)", () => {
    expect(validateReportScheduleFiltersJson("")).toEqual({ status: "empty", unknownKeys: [] });
    expect(validateReportScheduleFiltersJson("   \n")).toEqual({ status: "empty", unknownKeys: [] });
  });

  it("accepts a valid JSON object with supported keys", () => {
    expect(validateReportScheduleFiltersJson('{"supportLine":"L1"}')).toEqual({
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

  it("keeps the supported key list aligned with the export row contract", () => {
    expect(reportScheduleFilterKeys).toContain("supportLine");
    expect(reportScheduleFilterKeys).toContain("csatBucket");
    expect(reportScheduleFilterKeys).toContain("externalSource");
    expect(reportScheduleFilterKeys).toContain("assigneeName");
  });
});
