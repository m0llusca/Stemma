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

const chatCompletionsEndpoint = "https://api.openai.com/v1/chat/completions";
const defaultModel = "gpt-4o";
const defaultTimeoutMs = 30_000;
const defaultMaxResponseBytes = 1_000_000;
const maxTokens = 2000;

const providerName = "openai";
const promptVersion = "openai-scoring-1";

export type OpenAiScoringProviderOptions = {
  apiKey: string;
  model?: string;
  organization?: string;
  transport?: ScoringTransport;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

/**
 * OpenAI (ChatGPT) scoring adapter — Chat Completions API.
 *
 * Uses json_object response format (the shared system prompt mentions "JSON",
 * which OpenAI requires for that mode), reads `choices[0].message.content`, and
 * normalizes it into a `ConversationScorePrediction`. Any parse/shape failure
 * throws a `ScoringProviderError` so the AI_SCORE job falls back to the
 * deterministic provider.
 */
export class OpenAiScoringProvider implements QualityScoringProvider {
  readonly name = providerName;
  readonly modelVersion: string;
  readonly promptVersion = promptVersion;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly organization?: string;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly client: ReturnType<typeof createScoringHttpClient>;

  constructor(options: OpenAiScoringProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model?.trim() || defaultModel;
    this.modelVersion = this.model;
    this.organization = options.organization?.trim() || undefined;
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    this.maxResponseBytes = options.maxResponseBytes ?? defaultMaxResponseBytes;
    this.client = createScoringHttpClient({ provider: providerName, transport: options.transport });
  }

  async scoreConversation(input: ScoringInput): Promise<ConversationScorePrediction> {
    const body = JSON.stringify({
      model: this.model,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildScoringSystemPrompt() },
        { role: "user", content: buildScoringUserPrompt(input) }
      ]
    });

    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      "content-type": "application/json"
    };
    if (this.organization) {
      headers["openai-organization"] = this.organization;
    }

    const responseText = await this.client.requestText({
      method: "POST",
      url: chatCompletionsEndpoint,
      headers,
      body,
      timeoutMs: this.timeoutMs,
      maxResponseBytes: this.maxResponseBytes
    });

    const text = this.extractMessageContent(responseText);
    return finalizePrediction(text, input, providerName);
  }

  private extractMessageContent(responseText: string): string {
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

    const content = readChoiceContent(envelope);
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new ScoringProviderError({
        code: "malformed_payload",
        provider: providerName,
        safeMessage: "Ответ модели не содержит текстового результата.",
        diagnostic: redactScoringDiagnostic({ envelope })
      });
    }

    return content;
  }
}

function readChoiceContent(envelope: unknown): unknown {
  if (!envelope || typeof envelope !== "object") {
    return undefined;
  }
  const choices = (envelope as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }
  const first = choices[0];
  if (!first || typeof first !== "object") {
    return undefined;
  }
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object") {
    return undefined;
  }
  return (message as Record<string, unknown>).content;
}

function serializeError(error: unknown) {
  return error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
}
