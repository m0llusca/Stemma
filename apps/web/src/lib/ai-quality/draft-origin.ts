/**
 * Whether an AI quality draft was produced by the deterministic fallback engine
 * (DeterministicScoringProvider, modelVersion "deterministic-*") rather than a
 * real LLM provider. The fallback runs when the chosen provider has no key, so a
 * draft can look like a genuine AI judgment while actually being a heuristic
 * placeholder — surfacing this keeps reviewers from over-trusting it.
 */
export function isDeterministicAiModel(modelVersion: string | null | undefined): boolean {
  return typeof modelVersion === "string" && modelVersion.trim().toLowerCase().startsWith("deterministic");
}
