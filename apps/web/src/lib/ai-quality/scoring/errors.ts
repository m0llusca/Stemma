/**
 * Typed error for the AI quality-scoring provider layer.
 *
 * The AI_SCORE background job catches this and falls back to the deterministic
 * provider, so failures must always surface as a `ScoringProviderError` (never
 * a raw network/parse exception). `safeMessage` is human-readable Russian copy
 * safe to surface in diagnostics; `diagnostic` is already secret-redacted.
 */
export type ScoringProviderErrorCode =
  | "auth_failed"
  | "http_error"
  | "invalid_json"
  | "malformed_payload"
  | "response_too_large"
  | "timeout"
  | "network_error";

export class ScoringProviderError extends Error {
  readonly code: ScoringProviderErrorCode;
  readonly provider: string;
  readonly safeMessage: string;
  readonly diagnostic: unknown;

  constructor(input: {
    code: ScoringProviderErrorCode;
    provider: string;
    safeMessage: string;
    diagnostic?: unknown;
  }) {
    super(input.safeMessage);
    this.name = "ScoringProviderError";
    this.code = input.code;
    this.provider = input.provider;
    this.safeMessage = input.safeMessage;
    this.diagnostic = input.diagnostic ?? null;
  }
}
