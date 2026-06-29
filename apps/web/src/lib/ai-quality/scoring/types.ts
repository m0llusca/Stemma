import type { CriterionKind } from "@prisma/client";

/**
 * Shared contract for the AI quality-scoring layer.
 *
 * A `QualityScoringProvider` turns a conversation transcript + the active
 * scorecard criteria into a per-criterion `ConversationScorePrediction`. The
 * prediction is persisted as an `AiQualityDraft` of kind "score" (its
 * `suggestedValueJson`), read back by the review workbench to drive the
 * per-criterion AI chips and the accept/reject/override decision flow.
 *
 * This module is the seam between the provider layer (YandexGPT adapter +
 * deterministic fallback), the AI_SCORE background job, and the workbench UI —
 * keep it dependency-light and pure.
 */

/** A single transcript message handed to the scorer. */
export type ScoringTranscriptMessage = {
  /** Stable message id, reused as an evidence ref. */
  id: string;
  /** Humanized author label, e.g. "Клиент" / "Оператор". */
  author: string;
  text: string;
};

/** A scorecard criterion the model must return a verdict for. */
export type ScoringCriterionSpec = {
  id: string;
  key: string;
  label: string;
  kind: CriterionKind; // "SCALE_1_3" | "PASS_FAIL"
  block: string;
  weight: number;
};

export type ScoringInput = {
  conversationId: string;
  subject: string;
  criteria: ScoringCriterionSpec[];
  transcript: ScoringTranscriptMessage[];
};

/** The model's verdict for one criterion. */
export type CriterionPrediction = {
  criterionId: string;
  criterionKey: string;
  /** 1..3 for SCALE_1_3 criteria; omitted otherwise. */
  value?: number;
  /** pass/fail verdict for PASS_FAIL criteria; omitted otherwise. */
  passed?: boolean;
  /** True when the criterion does not apply to this conversation. */
  isNotApplicable?: boolean;
  /** 0..1 confidence for this criterion. */
  confidence: number;
  /** Short Russian rationale. */
  rationale: string;
  /** Evidence ref into the transcript (a message id), if any. */
  evidenceRef?: string;
};

/** The full per-conversation prediction stored in a "score" draft. */
export type ConversationScorePrediction = {
  criteria: CriterionPrediction[];
  /** 0..1 overall model confidence. */
  overallConfidence: number;
  /** Short Russian summary of the assessment. */
  summary: string;
};

/**
 * A pluggable scoring backend. Implementations: the YandexGPT adapter and the
 * deterministic fallback. `resolveScoringProvider()` (from this package's index)
 * selects the adapter when credentials are configured, else the fallback.
 */
export interface QualityScoringProvider {
  readonly name: string;
  readonly modelVersion: string;
  readonly promptVersion: string;
  scoreConversation(input: ScoringInput): Promise<ConversationScorePrediction>;
}

function clampUnit(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.min(1, Math.max(0, n));
}

/**
 * Defensive parse of a stored "score" draft payload (model output can be
 * malformed). Returns null when the shape is unusable so callers fall back to
 * "no prediction" rather than crashing.
 */
export function parseConversationScorePrediction(json: string): ConversationScorePrediction | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const rawCriteria = record.criteria;

  if (!Array.isArray(rawCriteria)) {
    return null;
  }

  const criteria: CriterionPrediction[] = [];

  for (const entry of rawCriteria) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const item = entry as Record<string, unknown>;
    const criterionId = typeof item.criterionId === "string" ? item.criterionId : "";
    const criterionKey = typeof item.criterionKey === "string" ? item.criterionKey : "";

    if (!criterionId && !criterionKey) {
      continue;
    }

    const prediction: CriterionPrediction = {
      criterionId,
      criterionKey,
      confidence: clampUnit(item.confidence),
      rationale: typeof item.rationale === "string" ? item.rationale : ""
    };

    if (typeof item.value === "number" && Number.isFinite(item.value)) {
      prediction.value = Math.min(3, Math.max(1, Math.round(item.value)));
    }
    if (typeof item.passed === "boolean") {
      prediction.passed = item.passed;
    }
    if (item.isNotApplicable === true) {
      prediction.isNotApplicable = true;
    }
    if (typeof item.evidenceRef === "string" && item.evidenceRef) {
      prediction.evidenceRef = item.evidenceRef;
    }

    criteria.push(prediction);
  }

  if (criteria.length === 0) {
    return null;
  }

  return {
    criteria,
    overallConfidence: clampUnit(record.overallConfidence),
    summary: typeof record.summary === "string" ? record.summary : ""
  };
}
