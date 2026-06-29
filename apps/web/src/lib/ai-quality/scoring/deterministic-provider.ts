import type {
  ConversationScorePrediction,
  CriterionPrediction,
  QualityScoringProvider,
  ScoringCriterionSpec,
  ScoringInput
} from "@/lib/ai-quality/scoring/types";

/**
 * No-credentials fallback scorer.
 *
 * Produces STABLE pseudo-predictions derived purely from the input (a hash of
 * the conversation id + each criterion key) so the same conversation always
 * yields the same verdict — no `Date`, no `Math.random`. This keeps the seeded
 * demo deterministic and reproducible without any external model, and gives the
 * AI_SCORE job a guaranteed result when YandexGPT credentials are absent or the
 * adapter fails.
 */
export class DeterministicScoringProvider implements QualityScoringProvider {
  readonly name = "deterministic";
  readonly modelVersion = "deterministic-1";
  readonly promptVersion = "deterministic-prompt-1";

  async scoreConversation(input: ScoringInput): Promise<ConversationScorePrediction> {
    const criteria = input.criteria.map((spec) => this.predictCriterion(input, spec));
    const overallConfidence = criteria.length
      ? round2(criteria.reduce((sum, criterion) => sum + criterion.confidence, 0) / criteria.length)
      : 0.5;

    return {
      criteria,
      overallConfidence,
      summary: buildSummary(input, criteria)
    };
  }

  private predictCriterion(input: ScoringInput, spec: ScoringCriterionSpec): CriterionPrediction {
    const seed = hashString(`${input.conversationId}::${spec.key}`);
    // Confidence in a plausible 0.55..0.95 band, stable per (conversation, criterion).
    const confidence = round2(0.55 + (seed % 41) / 100);
    const evidenceRef = pickEvidenceRef(input, seed);

    const prediction: CriterionPrediction = {
      criterionId: spec.id,
      criterionKey: spec.key,
      confidence,
      rationale: "",
      ...(evidenceRef ? { evidenceRef } : {})
    };

    if (spec.kind === "SCALE_1_3") {
      const value = (seed % 3) + 1; // 1..3
      prediction.value = value;
      prediction.rationale = scaleRationale(spec, value);
    } else {
      const passed = seed % 4 !== 0; // ~75% pass, stable per criterion
      prediction.passed = passed;
      prediction.rationale = passFailRationale(spec, passed);
    }

    return prediction;
  }
}

function pickEvidenceRef(input: ScoringInput, seed: number): string | undefined {
  if (input.transcript.length === 0) {
    return undefined;
  }
  return input.transcript[seed % input.transcript.length]?.id;
}

function scaleRationale(spec: ScoringCriterionSpec, value: number): string {
  if (value >= 3) {
    return `Критерий «${spec.label}» выполнен на отличном уровне.`;
  }
  if (value === 2) {
    return `Критерий «${spec.label}» выполнен частично, есть зоны роста.`;
  }
  return `Критерий «${spec.label}» почти не выполнен, требуется внимание.`;
}

function passFailRationale(spec: ScoringCriterionSpec, passed: boolean): string {
  return passed
    ? `Критерий «${spec.label}» соблюден.`
    : `Критерий «${spec.label}» не соблюден, нужна корректировка.`;
}

function buildSummary(input: ScoringInput, criteria: CriterionPrediction[]): string {
  const strong = criteria.filter((criterion) => (criterion.value ?? 0) >= 3 || criterion.passed === true).length;
  const weak = criteria.length - strong;
  return `Автооценка по теме «${input.subject}»: сильных критериев — ${strong}, требующих внимания — ${weak}.`;
}

/** Deterministic 32-bit FNV-1a hash. Stable across runs and platforms. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
