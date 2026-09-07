/**
 * Maps finalized criterion scores into agent-facing deduction rows.
 * Quotes come only from the linked message — never invented.
 * How-to-fix is 1–3 concrete actions; generic «будьте внимательнее» is discarded.
 */

import { coachingPlanFocusHref } from "@/lib/coaching-follow-up";
import { formatQualityScoreDelta } from "@/lib/score-display";

export const AGENT_QUOTE_UNAVAILABLE = "цитата недоступна";

const EVIDENCE_QUOTE_MAX = 220;
const GENERIC_HOW_TO_FIX = /будьте внимательн|просто будьте внимательн|нужно быть внимательн/i;

export type AgentCriterionScoreInput = {
  id: string;
  value: number | null;
  passed: boolean | null;
  isNotApplicable: boolean;
  comment: string;
  evidenceMessageId: string | null;
  criterion: {
    label: string;
    kind: string;
    weight: number;
  };
  evidenceMessage?: {
    id: string;
    body: string;
  } | null;
};

export type AgentFeedbackTrainingLink = {
  title: string;
  coachingPlanId?: string | null;
};

export type AgentFeedbackCoachingLink = {
  action: string;
};

export type AgentCriterionFeedbackContext = {
  trainingAssignments?: readonly AgentFeedbackTrainingLink[];
  coachingActions?: readonly AgentFeedbackCoachingLink[];
};

export type AgentHowToFixStep = {
  text: string;
  href: string | null;
};

export type AgentCriterionFeedbackItem = {
  id: string;
  label: string;
  resultLabel: string;
  isCriticalFail: boolean;
  /** Whole-review points lost by this deduction (negative or zero). */
  impactPoints: number;
  impactLabel: string;
  howToImprove: string | null;
  howToFixSteps: AgentHowToFixStep[];
  evidenceQuote: string | null;
  evidenceMessageId: string | null;
  hasQuote: boolean;
  hasHowToFix: boolean;
};

export function isCriterionDeduction(score: AgentCriterionScoreInput): boolean {
  if (score.isNotApplicable) {
    return false;
  }

  if (score.criterion.kind === "PASS_FAIL") {
    return score.passed === false;
  }

  return score.value != null && score.value < 3;
}

export function formatCriterionResultLabel(score: AgentCriterionScoreInput): string {
  if (score.criterion.kind === "PASS_FAIL") {
    return score.passed ? "зачтено" : "не зачтено";
  }

  if (score.value == null) {
    return "без оценки";
  }

  return `${score.value}/3`;
}

export function truncateEvidenceQuote(body: string, max = EVIDENCE_QUOTE_MAX): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

export function isGenericHowToFixAdvice(text: string): boolean {
  return GENERIC_HOW_TO_FIX.test(text.trim());
}

export function splitHowToFixComment(comment: string): string[] {
  return comment
    .split(/\n+|(?<=[.!?…])\s+/)
    .map((part) => part.replace(/^[-•]\s*/, "").trim())
    .filter((part) => part.length > 0 && !isGenericHowToFixAdvice(part));
}

/**
 * Points this deduction removes from the 0–100 review total.
 * Uses the same weighted formula as `calculateReviewScore` without changing it.
 */
export function criterionDeductionImpactPoints(
  scores: readonly AgentCriterionScoreInput[],
  targetId: string
): number {
  const applicable = scores.filter((score) => !score.isNotApplicable);
  const maxWeight = applicable.reduce((total, score) => total + Math.max(0, score.criterion.weight), 0);
  const target = applicable.find((score) => score.id === targetId);

  if (!target || maxWeight <= 0) {
    return 0;
  }

  const lostWeight = deductionLostWeight(target);
  const impact = -((lostWeight / maxWeight) * 100);
  return Math.sign(impact) * Math.round(Math.abs(impact));
}

function deductionLostWeight(score: AgentCriterionScoreInput): number {
  const weight = Math.max(0, score.criterion.weight);

  if (score.criterion.kind === "PASS_FAIL") {
    return score.passed === false ? weight : 0;
  }

  if (score.value == null) {
    return 0;
  }

  return weight * ((3 - score.value) / 3);
}

export function buildHowToFixSteps(
  score: AgentCriterionScoreInput,
  context: AgentCriterionFeedbackContext = {},
  hasQuote = false
): AgentHowToFixStep[] {
  const steps: AgentHowToFixStep[] = [];
  const seen = new Set<string>();

  const pushStep = (text: string, href: string | null = null) => {
    const normalized = text.trim();
    if (!normalized || isGenericHowToFixAdvice(normalized) || seen.has(normalized) || steps.length >= 3) {
      return;
    }

    seen.add(normalized);
    steps.push({ text: normalized, href });
  };

  for (const part of splitHowToFixComment(score.comment)) {
    pushStep(part);
  }

  for (const assignment of context.trainingAssignments ?? []) {
    const title = assignment.title.trim();
    if (!title) {
      continue;
    }

    pushStep(
      `Откройте учебную задачу «${title}» и разберите этот критерий.`,
      assignment.coachingPlanId
        ? coachingPlanFocusHref({ planId: assignment.coachingPlanId })
        : "/coaching"
    );
  }

  for (const action of context.coachingActions ?? []) {
    pushStep(action.action.trim(), "/coaching");
  }

  if (steps.length === 0) {
    pushStep(`Сверьте ответ с критерием «${score.criterion.label}» и правилами команды.`);
    if (hasQuote) {
      pushStep("Перечитайте цитату из диалога и отметьте, что именно не совпало с критерием.");
    }
  }

  return steps.slice(0, 3);
}

export function toAgentCriterionFeedbackItems(
  scores: AgentCriterionScoreInput[],
  context: AgentCriterionFeedbackContext = {}
): AgentCriterionFeedbackItem[] {
  return scores.filter(isCriterionDeduction).map((score) => {
    const howToImprove = score.comment.trim() || null;
    const evidenceBody = score.evidenceMessage?.body?.trim() ?? "";
    const evidenceQuote = evidenceBody ? truncateEvidenceQuote(evidenceBody) : null;
    const hasQuote = Boolean(evidenceQuote);
    const howToFixSteps = buildHowToFixSteps(score, context, hasQuote);
    const impactPoints = criterionDeductionImpactPoints(scores, score.id);

    return {
      id: score.id,
      label: score.criterion.label,
      resultLabel: formatCriterionResultLabel(score),
      isCriticalFail: score.criterion.kind === "PASS_FAIL" && score.passed === false,
      impactPoints,
      impactLabel: formatQualityScoreDelta(impactPoints),
      howToImprove,
      howToFixSteps,
      evidenceQuote,
      evidenceMessageId: score.evidenceMessageId,
      hasQuote,
      hasHowToFix: howToFixSteps.length > 0
    };
  });
}
