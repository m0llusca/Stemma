import type { Prisma, Scorecard, ScorecardCriterion } from "@prisma/client";

export type ReviewRubric = Scorecard & { criteria: ScorecardCriterion[] };

export function rubricSignature(scorecard: ReviewRubric) {
  return JSON.stringify({ version: scorecard.version, criteria: scorecard.criteria.map(
    ({ id, key, label, block, kind, weight, required, order }) => ({ id, key, label, block, kind, weight, required, order })
  ) });
}

/** Hold the rubric stable until the grade commits, and reject a stale workbench. */
export async function assertReviewRubricStable(tx: Prisma.TransactionClient, workspaceId: string, expected: ReviewRubric) {
  await tx.$queryRaw`SELECT id FROM "Scorecard" WHERE id = ${expected.id} AND "workspaceId" = ${workspaceId} FOR SHARE`;
  const current = await tx.scorecard.findFirst({
    where: { id: expected.id, workspaceId }, include: { criteria: { orderBy: { order: "asc" } } }
  });
  if (!current || rubricSignature(current) !== rubricSignature(expected)) {
    throw new Error("Форма оценки изменилась. Обновите страницу перед сохранением проверки.");
  }
}
