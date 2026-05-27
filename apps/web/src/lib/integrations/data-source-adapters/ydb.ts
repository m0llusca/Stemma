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

function queryText(config: Record<string, unknown>) {
  const value = config.query;

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Для YDB укажите YQL query.");
  }

  return value.trim();
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

export function createYdbAdapter() {
  return {
    async loadRows(input: DataSourceAdapterLoadInput): Promise<DataSourceAdapterLoadResult> {
      if (!input.baseUrl) {
        throw new Error("Для YDB укажите endpoint/database connection string.");
      }

      const driver = new Driver(input.baseUrl, {
        credentialsProvider: credentials(input.credential, input.baseUrl)
      });

      try {
        await driver.ready();
        const sql = query(driver);
        const resultSets = await sql`${unsafe(queryText(input.config))}`;
        const rows = firstResultRows(resultSets, input.limit);
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
