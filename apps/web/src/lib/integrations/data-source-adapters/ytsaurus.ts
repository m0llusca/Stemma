import { normalizeTabularConversationRows } from "@/lib/normalizers/tabular-conversations";
import type {
  DataSourceAdapterLoadInput,
  DataSourceAdapterLoadResult
} from "@/lib/integrations/data-source-adapters/types";

const defaultTimeoutMs = 15_000;

function textConfig(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

function safeProxyUrl(baseUrl: string | null) {
  if (!baseUrl) {
    throw new Error("Для YTsaurus укажите proxy URL.");
  }

  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("YTsaurus proxy URL должен начинаться с http:// или https://.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("YTsaurus proxy URL должен начинаться с http:// или https://.");
  }

  return url.toString().replace(/\/$/, "");
}

export function createYTsaurusAdapter() {
  return {
    async loadRows(input: DataSourceAdapterLoadInput): Promise<DataSourceAdapterLoadResult> {
      const proxyUrl = safeProxyUrl(input.baseUrl);
      const tablePath = textConfig(input.config, "tablePath");

      if (!tablePath.startsWith("//")) {
        throw new Error("Для YTsaurus укажите tablePath в формате //path/to/table.");
      }

      const url = `${proxyUrl}/api/v3/read_table?path=${encodeURIComponent(tablePath)}`;
      const response = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: {
            accept: "application/json",
            authorization: `OAuth ${input.credential ?? ""}`
          }
        },
        input.timeoutMs ?? defaultTimeoutMs
      );
      const text = await response.text();

      if (Buffer.byteLength(text, "utf8") > (input.maxResponseBytes ?? 2_000_000)) {
        throw new Error("Ответ YTsaurus превышает лимит размера.");
      }

      if (!response.ok) {
        throw new Error(`YTsaurus вернул HTTP ${response.status}.`);
      }

      let rows: unknown;

      try {
        rows = text ? JSON.parse(text) : [];
      } catch {
        throw new Error("YTsaurus вернул ответ не в JSON-формате.");
      }

      const rowArray = Array.isArray(rows) ? rows.slice(0, input.limit) : [];
      const conversations = normalizeTabularConversationRows(rowArray, {
        source: "ytsaurus",
        samplingReason: "Импорт YTsaurus/YT: строки таблицы."
      });

      return {
        source: "ytsaurus",
        rows: rowArray,
        conversations,
        diagnostics: {
          requests: [
            {
              operation: "table_read",
              method: "GET",
              url,
              statusCode: response.status
            }
          ]
        }
      };
    }
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      fetch(url, init),
      new Promise<Response>((_, reject) => {
        timer = setTimeout(() => reject(new Error("YTsaurus request timed out.")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
