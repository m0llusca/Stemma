import { StaticCredentialsProvider } from "@ydbjs/auth/static";
import { Driver } from "@ydbjs/core";
import { query, unsafe } from "@ydbjs/query";
import type { JSValue } from "@ydbjs/value";
import { normalizeTabularConversationRows } from "@/lib/normalizers/tabular-conversations";
import type {
  DataSourceAdapterLoadInput,
  DataSourceAdapterLoadResult
} from "@/lib/integrations/data-source-adapters/types";

type YdbResultRow = Record<string, JSValue>;

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 2_000_000;
const mutationKeywordPattern = /\b(UPSERT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|GRANT|REVOKE|CALL|PRAGMA)\b/i;
const commentTokenPattern = /--|\/\*|\*\//;
const trailingLimitPattern = /\s+LIMIT\s+(\d+)\s*$/i;
const tablePathPattern = /^[A-Za-z0-9_./-]+$/;

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

function credentials(value: string | undefined, endpoint: string) {
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

  const username = (parsed as { username?: unknown }).username;
  const password = (parsed as { password?: unknown }).password;

  if (typeof username !== "string" || typeof password !== "string") {
    throw new Error("YDB credentials должны содержать username и password.");
  }

  return new StaticCredentialsProvider({ username, password }, endpoint);
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
        const conversations = normalizeTabularConversationRows(rows, {
          source: "ydb",
          samplingReason: "Импорт YDB: строки YQL-запроса."
        });

        return {
          source: "ydb",
          rows,
          conversations,
          diagnostics: {
            requests: [
              {
                operation: "query_execute",
                method: "YQL",
                url: input.baseUrl,
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
