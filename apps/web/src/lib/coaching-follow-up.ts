/**
 * Cross-link helpers between finalized reviews and coaching/training.
 * CoachingPlan may store optional reviewId/conversationId origin FKs; deep
 * links still carry the same IDs so create forms can persist them.
 * Training is TrainingAssignment only (no quiz / LMS module).
 */

/** Matches {@link toneForScore} negative band: below 70 is a clear coaching signal. */
export const COACHING_LOW_SCORE_THRESHOLD = 70;

/** Prefill for createTrainingAssignmentFromReview from a Finding / CoachingAction. */
export function trainingAssignmentDefaultsFromFinding(input: {
  category: string;
  coachingAction?: string | null;
  evidenceSummary?: string | null;
  summary?: string | null;
}) {
  const category = input.category.trim() || "итог проверки";
  const description =
    input.coachingAction?.trim() ||
    input.evidenceSummary?.trim() ||
    input.summary?.trim() ||
    `Follow-up по категории «${category}»`;

  return {
    title: `Разбор: ${category}`,
    description
  };
}

export type CoachingFollowUpSignal = {
  totalScore: number;
  criticalError: boolean;
  findings: ReadonlyArray<{ riskLevel: string }>;
};

export type CoachingOfferParams = {
  agentName: string;
  reviewId: string;
  conversationId: string;
};

export function needsCoachingFollowUp(signal: CoachingFollowUpSignal): boolean {
  if (signal.criticalError) {
    return true;
  }

  if (signal.findings.some((finding) => finding.riskLevel === "HIGH" || finding.riskLevel === "CRITICAL")) {
    return true;
  }

  return Number.isFinite(signal.totalScore) && signal.totalScore < COACHING_LOW_SCORE_THRESHOLD;
}

export function coachingPlanCreateHref(params: { agentName: string; reviewId?: string; conversationId?: string }) {
  const search = new URLSearchParams({ plan: "1", agentName: params.agentName });
  if (params.reviewId) {
    search.set("reviewId", params.reviewId);
  }
  if (params.conversationId) {
    search.set("conversationId", params.conversationId);
  }
  return `/coaching?${search.toString()}`;
}

export function coachingAgentFocusHref(agentName: string) {
  return `/coaching?q=${encodeURIComponent(agentName)}`;
}

/** Deep-link to a specific plan on the coaching board (ID-stable, not only agent name). */
export function coachingPlanFocusHref(params: { planId: string; agentName?: string }) {
  const search = new URLSearchParams({ planId: params.planId });
  if (params.agentName) {
    search.set("q", params.agentName);
  }
  return `/coaching?${search.toString()}`;
}

export function appendCoachingOfferParams(href: string, offer: CoachingOfferParams) {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("coachOffer", "1");
  params.set("coachAgent", offer.agentName);
  params.set("coachReviewId", offer.reviewId);
  params.set("coachConversationId", offer.conversationId);
  return `${path}?${params.toString()}`;
}

export function coachingOfferFromSearchParams(
  params: Record<string, string | string[] | undefined> | URLSearchParams
): CoachingOfferParams | null {
  const read = (key: string) => {
    if (params instanceof URLSearchParams) {
      return params.get(key)?.trim() || "";
    }
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.trim() || "";
  };

  if (read("coachOffer") !== "1") {
    return null;
  }

  const agentName = read("coachAgent");
  const reviewId = read("coachReviewId");
  const conversationId = read("coachConversationId");

  if (!agentName || !reviewId || !conversationId) {
    return null;
  }

  return { agentName, reviewId, conversationId };
}
