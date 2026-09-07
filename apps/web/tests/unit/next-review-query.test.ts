import { describe, expect, it } from "vitest";
import { outOfSampleSamplingType } from "@/lib/sampling-engine";
import { nextReviewWhere } from "@/lib/review/next-review-query";

describe("nextReviewWhere", () => {
  it("scopes support agents by assigneeId, not display name", () => {
    expect(
      nextReviewWhere({
        id: "agent-1",
        name: "Оператор",
        workspaceId: "workspace-1",
        role: "SUPPORT_AGENT"
      })
    ).toEqual({
      workspaceId: "workspace-1",
      qaStatus: { not: "FINALIZED" },
      samplingType: { not: outOfSampleSamplingType },
      assigneeId: "agent-1"
    });
  });

  it("does not scope managers by assignee", () => {
    expect(
      nextReviewWhere({
        id: "qa-1",
        name: "Аналитик",
        workspaceId: "workspace-1",
        role: "QA_ANALYST"
      })
    ).toEqual({
      workspaceId: "workspace-1",
      qaStatus: { not: "FINALIZED" },
      samplingType: { not: outOfSampleSamplingType }
    });
  });

  it("is the base eligibility only — URL filters are not in nextReviewWhere", () => {
    const where = nextReviewWhere({
      id: "qa-1",
      name: "Аналитик",
      workspaceId: "workspace-1",
      role: "QA_ANALYST"
    });

    expect(where).not.toHaveProperty("reviewDueAt");
    expect(where).not.toHaveProperty("process");
    expect(where).not.toHaveProperty("riskLevel");
    expect(Object.keys(where).sort()).toEqual(["qaStatus", "samplingType", "workspaceId"]);
  });

  it("excludes unmatched sampling (OUT_OF_SAMPLE) from take-next", () => {
    const where = nextReviewWhere({
      id: "qa-1",
      name: "Аналитик",
      workspaceId: "workspace-1",
      role: "QA_ANALYST"
    });

    expect(where.samplingType).toEqual({ not: "OUT_OF_SAMPLE" });
  });
});
