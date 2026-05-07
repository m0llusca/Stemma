export type OtrsConnectorErrorCode =
  | "config_invalid"
  | "secret_missing"
  | "tls_failed"
  | "webservice_unreachable"
  | "auth_failed"
  | "ticket_search_failed"
  | "ticket_get_failed"
  | "invalid_json"
  | "response_too_large"
  | "timeout"
  | "normalization_failed"
  | "db_dry_run_failed";

export class OtrsConnectorError extends Error {
  readonly code: OtrsConnectorErrorCode;
  readonly safeMessage: string;
  readonly redactedDetail: unknown;
  readonly remediationHint?: string;

  constructor(input: {
    code: OtrsConnectorErrorCode;
    safeMessage: string;
    redactedDetail?: unknown;
    remediationHint?: string;
  }) {
    super(input.safeMessage);
    this.name = "OtrsConnectorError";
    this.code = input.code;
    this.safeMessage = input.safeMessage;
    this.redactedDetail = input.redactedDetail ?? null;
    this.remediationHint = input.remediationHint;
  }
}
