import type { Prisma } from "@prisma/client";

/**
 * Score drafts below this overall confidence (0..1) are AI exceptions while still
 * pending a human decision. Null confidence is treated as uncertain.
 */
export const AI_SCORE_DRAFT_LOW_CONFIDENCE = 0.7;

/**
 * Conversations with a score draft that is low-confidence / undecided, or that a
 * human already rejected / overrode, belong in the AI-exceptions queue lane.
 */
export function aiExceptionDraftWhere(): Prisma.AiQualityDraftWhereInput {
  return {
    kind: "score",
    OR: [
      { status: { in: ["rejected", "changed"] } },
      {
        AND: [
          { status: "draft" },
          {
            OR: [{ confidence: null }, { confidence: { lt: AI_SCORE_DRAFT_LOW_CONFIDENCE } }]
          }
        ]
      }
    ]
  };
}
