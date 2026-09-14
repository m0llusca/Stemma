import { describe, expect, it } from "vitest";
import { defaultPilotSeatPack, seatKindForRole, summarizeSeatUsage } from "@/lib/packaging/seat-pack";

describe("seat packaging sketch", () => {
  it("maps product roles onto seat kinds", () => {
    expect(seatKindForRole("ADMIN")).toBe("admin");
    expect(seatKindForRole("TEAM_LEAD")).toBe("team_lead");
    expect(seatKindForRole("unknown")).toBeNull();
  });

  it("flags soft over-quota for AI drafts and sources", () => {
    const summary = summarizeSeatUsage({
      pack: defaultPilotSeatPack,
      roleCounts: { ADMIN: 1, QA_ANALYST: 12 },
      aiDraftsThisMonth: 2_500,
      certifiedSources: 4
    });

    expect(summary.seats.qa_reviewer.used).toBe(12);
    expect(summary.seats.qa_reviewer.cap).toBe(10);
    expect(summary.aiDrafts.overQuota).toBe(true);
    expect(summary.sources.overIncluded).toBe(true);
  });
});
