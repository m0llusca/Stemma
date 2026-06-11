import type { OtrsHttpClient } from "@/lib/integrations/otrs-family/client";
import type { OtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import { OtrsConnectorError } from "@/lib/integrations/otrs-family/errors";
import { buildSessionCreateRequest, parseSessionCreateResponse } from "@/lib/integrations/otrs-family/requests";

export type OtrsSessionAuthOperation = "ticketSearch" | "ticketGet";

export function operationUsesSessionAuth(config: OtrsConnectorConfig, operation: OtrsSessionAuthOperation) {
  return config.auth[operation] === "session";
}

export async function createOtrsSession(input: {
  client: Pick<OtrsHttpClient, "requestJson">;
  config: OtrsConnectorConfig;
  baseUrl?: string;
  userLogin: string;
  password: string;
}) {
  const payload = await input.client.requestJson(
    buildSessionCreateRequest({
      config: input.config,
      baseUrl: input.baseUrl,
      userLogin: input.userLogin,
      password: input.password
    })
  );
  const sessionId = parseSessionCreateResponse(payload);

  if (!sessionId) {
    throw new OtrsConnectorError({
      code: "auth_failed",
      safeMessage: "OTRS SessionCreate did not return a SessionID.",
      redactedDetail: {
        operation: "SessionCreate",
        response: payload
      },
      remediationHint: "Check the OTRS user credentials and GenericInterface SessionCreate operation."
    });
  }

  return sessionId;
}

export async function sessionIdForOperation(input: {
  client: Pick<OtrsHttpClient, "requestJson">;
  config: OtrsConnectorConfig;
  baseUrl?: string;
  userLogin: string;
  password: string;
  operation: OtrsSessionAuthOperation;
  existingSessionId?: string;
}) {
  if (!operationUsesSessionAuth(input.config, input.operation)) {
    return undefined;
  }

  return input.existingSessionId ?? createOtrsSession(input);
}

/**
 * Runs a session-bound request and retries it once with a fresh SessionID if the
 * cached session has expired mid-operation. OTRS surfaces an expired session as
 * an `auth_failed` OtrsConnectorError. Long imports can outlive a session, so the
 * single re-auth keeps the run going instead of skipping every remaining ticket.
 *
 * For operations that do not use session auth, the thunk runs once with no retry.
 * When the session is refreshed, `onSessionRefreshed` is invoked so callers can
 * reuse the new SessionID for subsequent requests and avoid re-authenticating per
 * ticket.
 */
export async function runWithSessionReauth<T>(input: {
  client: Pick<OtrsHttpClient, "requestJson">;
  config: OtrsConnectorConfig;
  baseUrl?: string;
  userLogin: string;
  password: string;
  operation: OtrsSessionAuthOperation;
  sessionId: string | undefined;
  run: (sessionId: string | undefined) => Promise<T>;
  onSessionRefreshed?: (sessionId: string) => void;
}): Promise<T> {
  if (!operationUsesSessionAuth(input.config, input.operation)) {
    return input.run(input.sessionId);
  }

  try {
    return await input.run(input.sessionId);
  } catch (error) {
    if (!(error instanceof OtrsConnectorError) || error.code !== "auth_failed") {
      throw error;
    }

    const refreshedSessionId = await createOtrsSession({
      client: input.client,
      config: input.config,
      baseUrl: input.baseUrl,
      userLogin: input.userLogin,
      password: input.password
    });

    input.onSessionRefreshed?.(refreshedSessionId);

    return input.run(refreshedSessionId);
  }
}
