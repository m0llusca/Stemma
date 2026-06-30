import { ScoringProviderError } from "@/lib/ai-quality/scoring/errors";
import { createScoringHttpClient, redactScoringDiagnostic, type ScoringTransport } from "@/lib/ai-quality/scoring/http";
import {
  buildScoringSystemPrompt,
  buildScoringUserPrompt,
  finalizePrediction
} from "@/lib/ai-quality/scoring/prompt";
import type {
  ConversationScorePrediction,
  QualityScoringProvider,
  ScoringInput
} from "@/lib/ai-quality/scoring/types";

const messagesEndpoint = "https://api.anthropic.com/v1/messages";
const anthropicVersion = "2023-06-01";
const defaultModel = "claude-opus-4-8";
const defaultTimeoutMs = 30_000;
const defaultMaxResponseBytes = 1_000_000;
const maxTokens = 2000;

const providerName = "anthropic";
const promptVersion = "anthropic-scoring-1";

export type AnthropicScoringProviderOptions = {
  apiKey: string;
  model?: string;
  transport?: ScoringTransport;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

/**
 * Anthropic (Claude) scoring adapter — Messages API (`POST /v1/messages`).
 *
 * Sends only model + max_tokens + system + a single user message: on
 * claude-opus-4-8 `temperature`/`top_p`/`thinking.budget_tokens` are rejected
 * with a 400, so they are intentionally omitted. Checks `stop_reason` for a
 * safety refusal before reading content; any parse/shape failure throws a
 * `ScoringProviderError` so the AI_SCORE job falls back to the deterministic
 * provider.
 */
export class AnthropicScoringProvider implements QualityScoringProvider {
  readonly name = providerName;
  readonly modelVersion: string;
  readonly promptVersion = promptVersion;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly client: ReturnType<typeof createScoringHttpClient>;

  constructor(options: AnthropicScoringProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model?.trim() || defaultModel;
    this.modelVersion = this.model;
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    this.maxResponseBytes = options.maxResponseBytes ?? defaultMaxResponseBytes;
    this.client = createScoringHttpClient({ provider: providerName, transport: options.transport });
  }

  async scoreConversation(input: ScoringInput): Promise<ConversationScorePrediction> {
    const body = JSON.stringify({
      model: this.model,
      max_tokens: maxTokens,
      system: buildScoringSystemPrompt(),
      messages: [{ role: "user", content: buildScoringUserPrompt(input) }]
    });

    const responseText = await this.client.requestText({
      method: "POST",
      url: messagesEndpoint,
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": anthropicVersion,
        "content-type": "application/json"
      },
      body,
      timeoutMs: this.timeoutMs,
      maxResponseBytes: this.maxResponseBytes
    });

    const text = this.extractMessageText(responseText);
    return finalizePrediction(text, input, providerName);
  }

  private extractMessageText(responseText: string): string {
    let envelope: unknown;
    try {
      envelope = JSON.parse(responseText);
    } catch (error) {
      throw new ScoringProviderError({
        code: "invalid_json",
        provider: providerName,
        safeMessage: "Сервис модели вернул ответ не в JSON-формате.",
        diagnostic: redactScoringDiagnostic({ parseError: serializeError(error) })
      });
    }

    if (!envelope || typeof envelope !== "object") {
      throw new ScoringProviderError({
        code: "malformed_payload",
        provider: providerName,
        safeMessage: "Ответ модели не содержит ожидаемого результата.",
        diagnostic: redactScoringDiagnostic({ envelope })
      });
    }

    const record = envelope as Record<string, unknown>;

    // Safety classifiers return HTTP 200 with stop_reason "refusal" and empty
    // content — treat as a provider failure so the job falls back.
    if (record.stop_reason === "refusal") {
      throw new ScoringProviderError({
        code: "malformed_payload",
        provider: providerName,
        safeMessage: "Модель отклонила запрос по политике безопасности.",
        diagnostic: redactScoringDiagnostic({ stopReason: record.stop_reason, stopDetails: record.stop_details })
      });
    }

    const text = readFirstTextBlock(record.content);
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new ScoringProviderError({
        code: "malformed_payload",
        provider: providerName,
        safeMessage: "Ответ модели не содержит текстового результата.",
        diagnostic: redactScoringDiagnostic({ stopReason: record.stop_reason })
      });
    }

    return text;
  }
}

function readFirstTextBlock(content: unknown): unknown {
  if (!Array.isArray(content)) {
    return undefined;
  }
  for (const block of content) {
    if (block && typeof block === "object" && (block as Record<string, unknown>).type === "text") {
      return (block as Record<string, unknown>).text;
    }
  }
  return undefined;
}

function serializeError(error: unknown) {
  return error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
}
