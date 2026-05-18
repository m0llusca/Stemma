import type { HelpdeskAdapterOperation, PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";

export type HelpdeskAdapterErrorCode =
  | "auth_failed"
  | "http_error"
  | "invalid_json"
  | "response_too_large"
  | "timeout"
  | "network_error"
  | "malformed_payload"
  | "unsupported_operation";

export class HelpdeskAdapterError extends Error {
  readonly code: HelpdeskAdapterErrorCode;
  readonly source: PhaseBHelpdeskSource;
  readonly operation: HelpdeskAdapterOperation;
  readonly safeMessage: string;
  readonly diagnostic: unknown;

  constructor(input: {
    code: HelpdeskAdapterErrorCode;
    source: PhaseBHelpdeskSource;
    operation: HelpdeskAdapterOperation;
    safeMessage: string;
    diagnostic?: unknown;
  }) {
    super(input.safeMessage);
    this.name = "HelpdeskAdapterError";
    this.code = input.code;
    this.source = input.source;
    this.operation = input.operation;
    this.safeMessage = input.safeMessage;
    this.diagnostic = input.diagnostic ?? null;
  }
}
