import { AccessTokenCredentialsProvider } from "@ydbjs/auth/access-token";
import { StaticCredentialsProvider } from "@ydbjs/auth/static";
import { ServiceAccountCredentialsProvider } from "@ydbjs/auth-yandex-cloud";
import { Driver } from "@ydbjs/core";
import { query, unsafe } from "@ydbjs/query";
import type { JSValue } from "@ydbjs/value";
import { normalizeTabularConversationRows } from "@/lib/normalizers/tabular-conversations";
import type {
  DataSourceAdapterLoadInput,
  DataSourceAdapterLoadResult
} from "@/lib/integrations/data-source-adapters/types";

type YdbResultRow = Record<string, JSValue>;
type YdbCredentialsProvider =
  | StaticCredentialsProvider
  | AccessTokenCredentialsProvider
  | ServiceAccountCredentialsProvider;

type YandexServiceAccountKey = {
  id: string;
  service_account_id: string;
  private_key: string;
  created_at?: string;
  key_algorithm?: string;
  public_key?: string;
};

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 2_000_000;
const redactedValue = "[REDACTED]";
const mutationKeywordPattern = /\b(UPSERT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|GRANT|REVOKE|CALL|PRAGMA)\b/i;
const commentTokenPattern = /--|\/\*|\*\//;
const trailingLimitPattern = /\s+LIMIT\s+(\d+)\s*$/i;
const tablePathPattern = /^[A-Za-z0-9_./-]+$/;
const credentialsShapeError =
  "YDB credentials: JSON с username+password, token, или Yandex service account key (id, service_account_id, private_key).";

function inputLimit(limit: number) {
  return Math.max(0, Math.floor(limit));
}

function textConfig(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

function readOnlyQueryError() {
  return new Error("YDB query должен быть read-only SELECT/WITH SELECT.");
}

function validateReadOnlyQuery(value: string, limit: number) {
  const text = value.trim();

  if (!text || text.includes(";") || commentTokenPattern.test(text) || mutationKeywordPattern.test(text)) {
    throw readOnlyQueryError();
  }

  if (!/^(SELECT|WITH)\b/i.test(text) || (/^WITH\b/i.test(text) && !/\bSELECT\b/i.test(text))) {
    throw readOnlyQueryError();
  }

  const enforcedLimit = inputLimit(limit);
  const trailingLimit = text.match(trailingLimitPattern);

  if (!trailingLimit) {
    return `${text} LIMIT ${enforcedLimit}`;
  }

  const existingLimit = Number.parseInt(trailingLimit[1] ?? "", 10);

  if (Number.isFinite(existingLimit) && existingLimit <= enforcedLimit) {
    return text;
  }

  return text.replace(trailingLimitPattern, ` LIMIT ${enforcedLimit}`);
}

function quoteTablePath(value: string) {
  const tablePath = value.trim();

  if (!tablePath || !tablePathPattern.test(tablePath)) {
    throw new Error("YDB tableName/tablePath содержит недопустимые символы.");
  }

  return `\`${tablePath}\``;
}

function queryText(config: Record<string, unknown>, limit: number) {
  const configuredQuery = textConfig(config, "query");

  if (configuredQuery) {
    return validateReadOnlyQuery(configuredQuery, limit);
  }

  const tablePath = textConfig(config, "tablePath") || textConfig(config, "tableName");

  if (tablePath) {
    return `SELECT * FROM ${quoteTablePath(tablePath)} LIMIT ${inputLimit(limit)}`;
  }

  throw new Error("Для YDB укажите tableName/tablePath или read-only YQL query.");
}

function diagnosticUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.username) {
      url.username = redactedValue;
    }

    if (url.password) {
      url.password = redactedValue;
    }

    if (url.search) {
      url.search = "?redacted=1";
    }

    return url.toString().replaceAll("%5BREDACTED%5D", redactedValue);
  } catch {
    return redactedValue;
  }
}

function isServiceAccountKey(value: Record<string, unknown>): value is YandexServiceAccountKey {
  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.service_account_id === "string" &&
    value.service_account_id.trim().length > 0 &&
    typeof value.private_key === "string" &&
    value.private_key.trim().length > 0
  );
}

function accessTokenFromCredential(value: Record<string, unknown>) {
  for (const key of ["token", "accessToken", "access_token", "iamToken", "iam_token"] as const) {
    const candidate = value[key];

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function credentials(value: string | undefined, endpoint: string): YdbCredentialsProvider | undefined {
  if (!value) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("YDB credentials должны быть JSON-объектом.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("YDB credentials должны быть JSON-объектом.");
  }

  const record = parsed as Record<string, unknown>;

  if (isServiceAccountKey(record)) {
    return new ServiceAccountCredentialsProvider(record);
  }

  const token = accessTokenFromCredential(record);

  if (token) {
    return new AccessTokenCredentialsProvider({ token });
  }

  const username = record.username;
  const password = record.password;

  if (typeof username === "string" && typeof password === "string") {
    return new StaticCredentialsProvider({ username, password }, endpoint);
  }

  throw new Error(credentialsShapeError);
}

/** Build a credentials provider from the encrypted/live credential JSON payload. */
export function createYdbCredentialsProvider(credential: string | undefined, endpoint: string) {
  return credentials(credential, endpoint);
}

function firstResultRows(resultSets: unknown, limit: number): YdbResultRow[] {
  if (!Array.isArray(resultSets) || !Array.isArray(resultSets[0])) {
    return [];
  }

  return resultSets[0].slice(0, limit) as YdbResultRow[];
}

function assertRowsWithinMaxResponseBytes(rows: YdbResultRow[], maxResponseBytes: number) {
  const serializedRows = JSON.stringify(rows);

  if (Buffer.byteLength(serializedRows, "utf8") > maxResponseBytes) {
    throw new Error("Ответ YDB превышает лимит размера.");
  }
}

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

export function createYdbAdapter() {
  return {
    async loadRows(input: DataSourceAdapterLoadInput): Promise<DataSourceAdapterLoadResult> {
      if (!input.baseUrl) {
        throw new Error("Для YDB укажите endpoint/database connection string.");
      }

      const yql = queryText(input.config, input.limit);
      const timeoutMs = input.timeoutMs ?? defaultTimeoutMs;
      const maxResponseBytes = input.maxResponseBytes ?? defaultMaxResponseBytes;
      const driver = new Driver(input.baseUrl, {
        credentialsProvider: credentials(input.credential, input.baseUrl)
      });

      try {
        await withTimeout(driver.ready(), timeoutMs, "YDB query timed out.");
        const sql = query(driver);
        const resultSets = await withTimeout(sql`${unsafe(yql)}`, timeoutMs, "YDB query timed out.");
        const rows = firstResultRows(resultSets, input.limit);
        assertRowsWithinMaxResponseBytes(rows, maxResponseBytes);
        const connectivityOnly = input.config.connectivityOnly === true;
        let conversations: ReturnType<typeof normalizeTabularConversationRows> = [];

        try {
          conversations = normalizeTabularConversationRows(rows, {
            source: "ydb",
            samplingReason: "Импорт YDB: строки YQL-запроса."
          });
        } catch (error) {
          if (!connectivityOnly) {
            throw error;
          }
        }

        return {
          source: "ydb",
          rows,
          conversations,
          diagnostics: {
            requests: [
              {
                operation: "query_execute",
                method: "YQL",
                url: diagnosticUrl(input.baseUrl),
                statusCode: 200
              }
            ]
          }
        };
      } finally {
        driver.close();
      }
    }
  };
}
