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
