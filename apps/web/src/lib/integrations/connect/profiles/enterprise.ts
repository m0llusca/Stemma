import {
  createHelpdeskHttpClient,
  type HelpdeskTransport
} from "@/lib/integrations/helpdesk-adapters/http";
import type { PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";
import { detectSourceFromHost } from "@/lib/integrations/connect/url-normalize";
import type {
  ConnectContext,
  CredentialField,
  SourceConnectionProfile,
  VerifyResult
} from "@/lib/integrations/connect/types";

// Server-side only. Enterprise (Salesforce/ServiceNow/Dynamics) connectors are OAuth
// client-credentials integrations that have NOT passed live certification, so they are
// shipped with honest "limited support": the credential form carries a warning hint and
// the source is flagged in `limitedSupportSources` for the UI badge. Connection is
// paste-only client-credentials — no interactive OAuth redirect flow (out of scope).

/**
 * Enterprise sources that ship with limited support (no live certification).
 * Consumed by the UI to render a "ограниченная поддержка" badge.
 */
export const limitedSupportSources = new Set<string>(["salesforce", "servicenow", "dynamics"]);

const LIMITED_SUPPORT_HINT =
  "ограниченная поддержка — требуется живая сертификация. Заполните, если у вас есть подключённое приложение OAuth (client credentials).";

const MANUAL_FALLBACK_HINT =
  "Живая сертификация не пройдена — настройте вручную в расширенных настройках.";

const ENTERPRISE_AUTH_MODE = "oauth_connected_app";

const TOKEN_TIMEOUT_MS = 15_000;
const TOKEN_MAX_RESPONSE_BYTES = 200_000;

// Test hook: the orchestrator/action never sets this; tests inject a fake transport that
// returns { statusCode, body } so verifyAuth can be exercised without real network I/O.
type TestableContext = ConnectContext & { __transport?: HelpdeskTransport };

type EnterpriseProfileConfig = {
  source: Extract<PhaseBHelpdeskSource, "salesforce" | "servicenow" | "dynamics">;
  // Path of the client-credentials token endpoint, appended to ctx.baseUrl.
  tokenPath: string;
};

const CLIENT_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    key: "clientId",
    label: "Client ID",
    placeholder: "3MVG9...",
    secret: false,
    hint: LIMITED_SUPPORT_HINT
  },
  {
    key: "clientSecret",
    label: "Client Secret",
    secret: true,
    hint: "Секрет подключённого приложения. Хранится в зашифрованном слоте."
  }
];

function buildTokenRequestBody(credentials: ConnectContext["credentials"]): string {
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credentials.clientId ?? "",
    client_secret: credentials.clientSecret ?? ""
  });
  return params.toString();
}

function buildEnterpriseProfile(config: EnterpriseProfileConfig): SourceConnectionProfile {
  return {
    source: config.source,
    type: "enterprise",
    urlPolicy: "required",
    hostPatterns: undefined,
    credentialFields: CLIENT_CREDENTIAL_FIELDS,
    normalizeUrl(raw: string) {
      const baseUrl = new URL(raw).origin;
      return { baseUrl, hints: { detectedSource: detectSourceFromHost(raw) } };
    },
    async verifyAuth(ctx: TestableContext): Promise<VerifyResult> {
      const client = createHelpdeskHttpClient(ctx.__transport ? { transport: ctx.__transport } : {});
      const secret = JSON.stringify({
        clientId: ctx.credentials.clientId ?? "",
        clientSecret: ctx.credentials.clientSecret ?? ""
      });
      try {
        const response = await client.requestJson({
          source: config.source,
          operation: "diagnostics",
          method: "POST",
          url: `${ctx.baseUrl}${config.tokenPath}`,
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: buildTokenRequestBody(ctx.credentials),
          timeoutMs: TOKEN_TIMEOUT_MS,
          maxResponseBytes: TOKEN_MAX_RESPONSE_BYTES
        });
        // requestJson resolves only on 2xx with parsed JSON; treat a body that carries an
        // access_token as a successful client-credentials exchange.
        const token = (response.body as { access_token?: unknown } | undefined)?.access_token;
        if (typeof token === "string" && token.length > 0) {
          return {
            status: "ok",
            detail: "Токен по client credentials получен.",
            authMode: ENTERPRISE_AUTH_MODE,
            secretSlots: [{ kind: "oauth_client_credentials", secret }]
          };
        }
        // 2xx without a token is not a usable connection.
        return {
          status: "failed",
          detail: "Источник не вернул токен доступа.",
          hint: MANUAL_FALLBACK_HINT,
          authMode: ENTERPRISE_AUTH_MODE,
          secretSlots: []
        };
      } catch {
        // requestJson throws on non-2xx (incl. 401/403), timeout, network and invalid JSON.
        // All of these are treated as a failed live probe with the manual-fallback hint.
        return {
          status: "failed",
          detail: "Не удалось получить токен по client credentials.",
          hint: MANUAL_FALLBACK_HINT,
          authMode: ENTERPRISE_AUTH_MODE,
          secretSlots: []
        };
      }
    }
  };
}

export const enterpriseProfiles = {
  // POST {baseUrl}/services/oauth2/token, grant_type=client_credentials.
  salesforce: buildEnterpriseProfile({ source: "salesforce", tokenPath: "/services/oauth2/token" }),
  // ServiceNow OAuth token endpoint.
  servicenow: buildEnterpriseProfile({ source: "servicenow", tokenPath: "/oauth_token.do" }),
  // Dynamics 365 / Dataverse — best-effort probe against the instance token endpoint.
  dynamics: buildEnterpriseProfile({ source: "dynamics", tokenPath: "/oauth2/token" })
} satisfies Record<string, SourceConnectionProfile>;
