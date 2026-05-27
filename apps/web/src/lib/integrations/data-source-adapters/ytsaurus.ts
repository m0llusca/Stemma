import { transferableAbortController } from "node:util";
import { normalizeTabularConversationRows } from "@/lib/normalizers/tabular-conversations";
import type {
  DataSourceAdapterLoadInput,
  DataSourceAdapterLoadResult
} from "@/lib/integrations/data-source-adapters/types";

const defaultTimeoutMs = 15_000;
const defaultMaxResponseBytes = 2_000_000;

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

function oauthToken(credential: string | undefined) {
  const token = credential?.trim();

  if (!token) {
    throw new Error("Для YTsaurus укажите OAuth token.");
  }

  return token;
}

export function createYTsaurusAdapter() {
  return {
    async loadRows(input: DataSourceAdapterLoadInput): Promise<DataSourceAdapterLoadResult> {
      const proxyUrl = safeProxyUrl(input.baseUrl);
      const tablePath = textConfig(input.config, "tablePath");
      const token = oauthToken(input.credential);

      if (!tablePath.startsWith("//")) {
        throw new Error("Для YTsaurus укажите tablePath в формате //path/to/table.");
      }

      const url = `${proxyUrl}/api/v3/read_table?path=${encodeURIComponent(tablePath)}`;
      const { response, text } = await fetchTextWithLimits(
        url,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-YT-Output-Format": "json",
            authorization: `OAuth ${token}`
          }
        },
        input.timeoutMs ?? defaultTimeoutMs,
        input.maxResponseBytes ?? defaultMaxResponseBytes
      );

      if (!response.ok) {
        throw new Error(`YTsaurus вернул HTTP ${response.status}.`);
      }

      const rowArray = parseRows(text).slice(0, input.limit);
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

async function fetchTextWithLimits(url: string, init: RequestInit, timeoutMs: number, maxResponseBytes: number) {
  const controller = transferableAbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortedForSize = false;

  try {
    timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await responseTextWithLimit(response, maxResponseBytes, () => {
      abortedForSize = true;
      controller.abort();
    });

    return { response, text };
  } catch (error) {
    if (controller.signal.aborted && !abortedForSize) {
      throw new Error("YTsaurus request timed out.");
    }

    throw error;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function responseTextWithLimit(response: Response, maxResponseBytes: number, abortForSize: () => void) {
  if (!response.body) {
    const text = await response.text();

    if (Buffer.byteLength(text, "utf8") > maxResponseBytes) {
      abortForSize();
      throw new Error("Ответ YTsaurus превышает лимит размера.");
    }

    return text;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    bytes += value.byteLength;

    if (bytes > maxResponseBytes) {
      abortForSize();
      await reader.cancel().catch(() => undefined);
      throw new Error("Ответ YTsaurus превышает лимит размера.");
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseRows(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return [];
  }

  try {
    return rowsFromParsedJson(JSON.parse(trimmed));
  } catch {
    return parseNdjsonRows(trimmed);
  }
}

function rowsFromParsedJson(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    const rows = (value as { rows?: unknown; values?: unknown }).rows;
    const values = (value as { rows?: unknown; values?: unknown }).values;

    if (Array.isArray(rows)) {
      return rows;
    }

    if (Array.isArray(values)) {
      return values;
    }

    return [value];
  }

  return [];
}

function parseNdjsonRows(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  try {
    return lines.map((line) => JSON.parse(line));
  } catch {
    throw new Error("YTsaurus вернул ответ не в JSON-формате.");
  }
}
