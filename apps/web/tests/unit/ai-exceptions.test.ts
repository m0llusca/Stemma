import { describe, expect, it } from "vitest";
import { AI_SCORE_DRAFT_LOW_CONFIDENCE, aiExceptionDraftWhere } from "@/lib/ai-quality/exceptions";

describe("ai exception draft where", () => {
  it("targets score drafts that humans rejected or overrode", () => {
    expect(aiExceptionDraftWhere()).toEqual(
      expect.objectContaining({
        kind: "score",
        OR: expect.arrayContaining([{ status: { in: ["rejected", "changed"] } }])
      })
    );
  });

  it("includes pending drafts with null or low confidence", () => {
    const where = aiExceptionDraftWhere();
    const pendingBranch = where.OR?.find(
      (clause) => clause && typeof clause === "object" && "AND" in clause
    ) as { AND: unknown[] } | undefined;

    expect(AI_SCORE_DRAFT_LOW_CONFIDENCE).toBe(0.7);
    expect(pendingBranch?.AND).toEqual(
      expect.arrayContaining([
        { status: "draft" },
        {
          OR: [{ confidence: null }, { confidence: { lt: AI_SCORE_DRAFT_LOW_CONFIDENCE } }]
        }
      ])
    );
  });
});
