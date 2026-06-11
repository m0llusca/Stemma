import { createOtrsHttpClient } from "@/lib/integrations/otrs-family/client";
import { parseOtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import { OtrsConnectorError } from "@/lib/integrations/otrs-family/errors";
import { detectOtrsRoutes } from "@/lib/integrations/otrs-family/route-detection";
import { buildTicketSearchRequest, type OtrsOperation } from "@/lib/integrations/otrs-family/requests";
import { createOtrsSession } from "@/lib/integrations/otrs-family/session-auth";
import { normalizeHelpdeskBaseUrl } from "@/lib/integrations/connect/url-normalize";
import type {
  AutoDetectResult,
  ConnectContext,
  SourceConnectionProfile,
  VerifyResult
} from "@/lib/integrations/connect/types";

// Маппинг operation-ключей детектора маршрутов в enum OtrsOperation —
// тот же адаптер, что в detectOtrsRoutesAction (src/lib/otrs-import-actions.ts).
const OPERATION_ENUM: Record<"ticketGet" | "ticketSearch" | "sessionCreate", OtrsOperation> = {
  ticketGet: "TicketGet",
  ticketSearch: "TicketSearch",
  sessionCreate: "SessionCreate"
};

export const otrsConnectionProfile: SourceConnectionProfile = {
  source: "otrs",
  type: "otrs_family",
  urlPolicy: "required",
  credentialFields: [
    { key: "userLogin", label: "Логин агента", secret: false, hint: "Учётная запись агента с доступом к GenericInterface." },
    { key: "password", label: "Пароль", secret: true }
  ],
  normalizeUrl(raw: string) {
    const { baseUrl, basePath } = normalizeHelpdeskBaseUrl(raw);
    return { baseUrl, hints: { basePath } };
  },
  async autoDetect(ctx: ConnectContext): Promise<AutoDetectResult> {
    const webServiceName = String(ctx.config.webServiceName ?? "GenericTicketConnectorREST");
    const config = parseOtrsConnectorConfig({ webServiceName });
    const client = createOtrsHttpClient({ config, baseUrl: ctx.baseUrl, userLogin: "", password: "" });
    try {
      const routes = await detectOtrsRoutes({
        baseUrl: ctx.baseUrl,
        webServiceName,
        testTicketId: ctx.testTicketId ?? "1",
        probeRoute: (request) =>
          client.probeRoute({
            operation: OPERATION_ENUM[request.operation as keyof typeof OPERATION_ENUM],
            method: request.method,
            url: request.url,
            headers:
              request.method === "POST"
                ? { accept: "application/json", "content-type": "application/json" }
                : { accept: "application/json" },
            body: request.method === "POST" ? {} : undefined,
            timeoutMs: config.limits.requestTimeoutMs,
            maxResponseBytes: config.limits.maxResponseBytes
          })
      });
      const detectedConfig: Record<string, unknown> = { webServiceName };
      if (routes.ticketGet || routes.ticketSearch) {
        detectedConfig.advanced = { routeOverridesEnabled: true };
        detectedConfig.routes = {
          ...(routes.ticketGet
            ? { ticketGetPath: routes.ticketGet.path, ticketGetMethod: routes.ticketGet.method }
            : {}),
          ...(routes.ticketSearch
            ? { ticketSearchPath: routes.ticketSearch.path, ticketSearchMethod: routes.ticketSearch.method }
            : {})
        };
      }
      const undetected = routes.undetected.length ? ` Не определены: ${routes.undetected.join(", ")}.` : "";
      return {
        status: routes.undetected.length ? "warning" : "ok",
        detail: `Маршруты определены.${undetected}`,
        hint: routes.undetected.includes("ticketSearch")
          ? "Маршрут поиска не привязан — задайте вручную в расширенных настройках."
          : undefined,
        config: detectedConfig
      };
    } catch (error) {
      return {
        status: "warning",
        detail: "Не удалось определить маршруты автоматически.",
        hint: error instanceof Error ? error.message : undefined
      };
    }
  },
  async verifyAuth(ctx: ConnectContext): Promise<VerifyResult> {
    const webServiceName = String(ctx.config.webServiceName ?? "GenericTicketConnectorREST");
    const detectedRoutes = ctx.config.routes ? { routes: ctx.config.routes } : {};
    const detectedAdvanced = ctx.config.advanced ? { advanced: ctx.config.advanced } : {};

    // 1. Сессионный режим — работает на установках с включённой операцией
    //    SessionCreate (проверено в живую на on-prem ФСА).
    const sessionConfig = parseOtrsConnectorConfig({
      webServiceName,
      ...detectedRoutes,
      ...detectedAdvanced,
      auth: { ticketGet: "session", ticketSearch: "session" }
    });
    const sessionClient = createOtrsHttpClient({
      config: sessionConfig,
      baseUrl: ctx.baseUrl,
      userLogin: ctx.credentials.userLogin,
      password: ctx.credentials.password
    });
    try {
      await createOtrsSession({
        client: sessionClient,
        config: sessionConfig,
        baseUrl: ctx.baseUrl,
        userLogin: ctx.credentials.userLogin,
        password: ctx.credentials.password
      });
      return {
        status: "ok",
        detail: "Сессия OTRS создана.",
        authMode: "session",
        secretSlots: [{ kind: "auth_password", secret: ctx.credentials.password }]
      };
    } catch {
      // 2. Fallback: на установках без SessionCreate (credentials-режим, а также
      //    тестовый фикстур) сессия недоступна. Источником истины делаем пробу
      //    TicketSearch с UserLogin/Password — она проходит на обоих типах
      //    установок: либо вернёт результат, либо явный auth_failed.
      return verifyOtrsCredentials({
        ctx,
        webServiceName,
        detectedRoutes,
        detectedAdvanced
      });
    }
  }
};

async function verifyOtrsCredentials(input: {
  ctx: ConnectContext;
  webServiceName: string;
  detectedRoutes: { routes?: unknown };
  detectedAdvanced: { advanced?: unknown };
}): Promise<VerifyResult> {
  const { ctx, webServiceName, detectedRoutes, detectedAdvanced } = input;
  const config = parseOtrsConnectorConfig({
    webServiceName,
    ...detectedRoutes,
    ...detectedAdvanced,
    auth: { ticketGet: "credentials", ticketSearch: "credentials" }
  });
  const client = createOtrsHttpClient({
    config,
    baseUrl: ctx.baseUrl,
    userLogin: ctx.credentials.userLogin,
    password: ctx.credentials.password
  });

  try {
    await client.requestJson(
      buildTicketSearchRequest({
        config,
        baseUrl: ctx.baseUrl,
        userLogin: ctx.credentials.userLogin,
        password: ctx.credentials.password,
        limit: 1
      })
    );
    return {
      status: "ok",
      detail: "OTRS принял учётные данные.",
      authMode: "credentials",
      secretSlots: [{ kind: "auth_password", secret: ctx.credentials.password }]
    };
  } catch (error) {
    if (error instanceof OtrsConnectorError && error.code === "auth_failed") {
      return {
        status: "failed",
        detail: "OTRS отклонил учётные данные.",
        hint: "Проверьте логин и пароль.",
        authMode: "credentials",
        secretSlots: []
      };
    }
    return {
      status: "failed",
      detail: "Не удалось проверить учётные данные OTRS.",
      hint: error instanceof OtrsConnectorError ? error.safeMessage : "Проверьте логин и пароль.",
      authMode: "credentials",
      secretSlots: []
    };
  }
}
