import { StaticCredentialsProvider } from "@ydbjs/auth/static";
import { Driver } from "@ydbjs/core";
import { HelpdeskAdapterError } from "@/lib/integrations/helpdesk-adapters/errors";
import {
  createHelpdeskHttpClient,
  type HelpdeskTransport
} from "@/lib/integrations/helpdesk-adapters/http";
import type {
  ConnectContext,
  SourceConnectionProfile,
  VerifyResult
} from "@/lib/integrations/connect/types";

// Тесты инъектируют транспорт/таймаут так же, как helpdesk-профили: дополнительными
// необязательными полями контекста, которые читает только нужный профиль.
type TestableContext = ConnectContext & {
  __transport?: HelpdeskTransport;
  __timeoutMs?: number;
};

const defaultProbeTimeoutMs = 10_000;

async function withTimeout<T>(operation: PromiseLike<T>, timeoutMs: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

// Строит URL и заголовки лёгкого probe-запроса YTsaurus. Чистая функция —
// тестируется напрямую и через инъекцию транспорта в verifyAuth.
export function buildYtsaurusVerifyRequest(baseUrl: string, oauthToken: string): {
  url: string;
  headers: Record<string, string>;
} {
  const proxyUrl = baseUrl.replace(/\/$/, "");
  return {
    url: `${proxyUrl}/api/v3/get?path=//@`,
    headers: {
      accept: "application/json",
      authorization: `OAuth ${oauthToken}`
    }
  };
}

// Сводит ошибку helpdesk-клиента к понятной русской подсказке. requestJson
// бросает HelpdeskAdapterError с типизированным code (401/403 → auth_failed).
function ytsaurusFailureHint(error: unknown): string {
  if (error instanceof HelpdeskAdapterError) {
    switch (error.code) {
      case "auth_failed":
        return "YTsaurus отклонил OAuth-токен — проверьте токен и доступ (код 401/403).";
      case "timeout":
        return "YTsaurus не ответил за отведённое время — проверьте proxy URL.";
      case "network_error":
        return "Не удалось подключиться к YTsaurus — проверьте proxy URL.";
      default:
        return error.safeMessage;
    }
  }

  return error instanceof Error
    ? error.message
    : "Проверьте proxy URL и OAuth-токен (доступ отклонён, код 401/403).";
}

export const dataSourceProfiles = {
  ydb: {
    source: "ydb",
    type: "data_source",
    urlPolicy: "required",
    credentialFields: [
      {
        key: "connectionString",
        label: "Строка подключения",
        placeholder: "grpcs://ydb.example.net:2135/?database=/ru/qc",
        secret: false,
        hint: "Endpoint и database в формате grpc(s)://host:port/?database=/path."
      },
      {
        key: "username",
        label: "Имя пользователя",
        secret: false,
        hint: "Учётная запись со статическими кредами YDB."
      },
      { key: "password", label: "Пароль", secret: true }
    ],
    normalizeUrl(raw: string) {
      // grpc(s)-строка подключения: не прогоняем через helpdesk-нормализацию,
      // которая ожидает http(s) и сводит путь к origin.
      return { baseUrl: raw };
    },
    async verifyAuth(ctx: TestableContext): Promise<VerifyResult> {
      const username = ctx.credentials.username ?? "";
      const password = ctx.credentials.password ?? "";
      const timeoutMs = ctx.__timeoutMs ?? defaultProbeTimeoutMs;
      // Лёгкая проверка готовности драйвера (driver.ready), а не SELECT 1:
      // выполнение запроса в probe требует построения YQL и таблицы/конфигурации
      // и существенно тяжелее. ready() поднимает gRPC-канал и проходит
      // discovery — этого достаточно, чтобы подтвердить доступность endpoint и
      // валидность статических кредов. Конструируем драйвер внутри try: ошибка
      // парсинга строки подключения может бросаться синхронно из new Driver.
      let driver: Driver | undefined;

      try {
        driver = new Driver(ctx.baseUrl, {
          credentialsProvider: new StaticCredentialsProvider({ username, password }, ctx.baseUrl)
        });
        await withTimeout(driver.ready(), timeoutMs, "YDB не ответил за отведённое время.");
        return {
          status: "ok",
          detail: "Драйвер YDB готов (проверка driver.ready, без выполнения запроса).",
          authMode: "static_credentials",
          secretSlots: [
            {
              kind: "data_source_credentials",
              secret: JSON.stringify({ username, password })
            }
          ]
        };
      } catch (error) {
        return {
          status: "failed",
          detail: "Не удалось подключиться к YDB.",
          hint:
            error instanceof Error
              ? error.message
              : "Проверьте строку подключения, имя пользователя и пароль.",
          authMode: "static_credentials",
          secretSlots: []
        };
      } finally {
        try {
          driver?.close();
        } catch {
          // close после неудачного ready может бросать — игнорируем.
        }
      }
    }
  },
  ytsaurus: {
    source: "ytsaurus",
    type: "data_source",
    urlPolicy: "required",
    credentialFields: [
      {
        key: "oauthToken",
        label: "OAuth-токен",
        secret: true,
        hint: "Токен YTsaurus/YT — отправляется заголовком Authorization: OAuth <token>."
      }
    ],
    normalizeUrl(raw: string) {
      // proxy URL передаётся как есть.
      return { baseUrl: raw };
    },
    async verifyAuth(ctx: TestableContext): Promise<VerifyResult> {
      const oauthToken = ctx.credentials.oauthToken ?? "";
      const timeoutMs = ctx.__timeoutMs ?? defaultProbeTimeoutMs;
      const { url, headers } = buildYtsaurusVerifyRequest(ctx.baseUrl, oauthToken);
      const client = createHelpdeskHttpClient(ctx.__transport ? { transport: ctx.__transport } : {});

      try {
        await client.requestJson({
          // YTsaurus не входит в PhaseBHelpdeskSource; используем generic-метку,
          // транспорт её не интерпретирует. Приведение нужно только для типов.
          source: "ytsaurus" as never,
          operation: "diagnostics" as never,
          method: "GET",
          url,
          headers,
          timeoutMs,
          maxResponseBytes: 200_000
        });
        // requestJson бросает на любой не-2xx (включая 401/403) — сюда попадаем
        // только при успешном 2xx.
        return {
          status: "ok",
          detail: "Авторизация YTsaurus подтверждена.",
          authMode: "oauth_token",
          secretSlots: [{ kind: "data_source_token", secret: oauthToken }]
        };
      } catch (error) {
        return {
          status: "failed",
          detail: "YTsaurus отклонил запрос.",
          hint: ytsaurusFailureHint(error),
          authMode: "oauth_token",
          secretSlots: []
        };
      }
    }
  }
} satisfies Record<string, SourceConnectionProfile>;
