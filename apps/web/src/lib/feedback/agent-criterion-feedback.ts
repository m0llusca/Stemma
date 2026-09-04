/**
 * Maps finalized criterion scores into agent-facing deduction rows.
 * Only surfaces real reviewer fields — never invents «как лучше» text.
 */

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
  };
  evidenceMessage?: {
    id: string;
    body: string;
  } | null;
};

export type AgentCriterionFeedbackItem = {
  id: string;
  label: string;
  resultLabel: string;
  /** Reviewer criterion comment — shown as «Как лучше» when present. */
  howToImprove: string | null;
  evidenceQuote: string | null;
  evidenceMessageId: string | null;
};

const EVIDENCE_QUOTE_MAX = 220;

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

export function toAgentCriterionFeedbackItems(
  scores: AgentCriterionScoreInput[]
): AgentCriterionFeedbackItem[] {
  return scores.filter(isCriterionDeduction).map((score) => {
    const howToImprove = score.comment.trim() || null;
    const evidenceBody = score.evidenceMessage?.body?.trim() ?? "";
    const evidenceQuote = evidenceBody ? truncateEvidenceQuote(evidenceBody) : null;

    return {
      id: score.id,
      label: score.criterion.label,
      resultLabel: formatCriterionResultLabel(score),
      howToImprove,
      evidenceQuote,
      evidenceMessageId: score.evidenceMessageId
    };
  });
}
