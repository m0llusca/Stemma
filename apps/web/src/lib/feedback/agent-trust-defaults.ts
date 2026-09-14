/**
 * Agent-facing trust defaults for feedback / self-review.
 * Quotes must come from linked messages; how-to-fix must be concrete.
 */

export const AGENT_TRUST_RULES = {
  quoteRequired: true,
  inventQuotesForbidden: true,
  genericHowToFixForbidden: true,
  maxHowToFixSteps: 3,
  evidenceQuoteMaxChars: 220
} as const;

export const AGENT_TRUST_EMPTY_STATE =
  "Нет вычета с цитатой из переписки — дождитесь финализации с evidence или уточните у QA.";

export const AGENT_TRUST_APPEAL_HINT =
  "Не согласны с оценкой — откройте апелляцию с конкретной цитатой. Это калибровочный сигнал, не спор ради спора.";
