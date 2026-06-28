export type AiQualityDraftKind =
  | "score"
  | "risk_tag"
  | "coaching_suggestion"
  | "training_recommendation"
  | "priority_summary";

export type AiQualityDraftDecision = "approved" | "rejected" | "changed";
