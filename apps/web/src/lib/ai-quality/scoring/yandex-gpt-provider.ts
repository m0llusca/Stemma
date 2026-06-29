import { ScoringProviderError } from "@/lib/ai-quality/scoring/errors";
import { createScoringHttpClient, redactScoringDiagnostic, type ScoringTransport } from "@/lib/ai-quality/scoring/http";
import {
  parseConversationScorePrediction,
  type ConversationScorePrediction,
  type CriterionPrediction,
  type QualityScoringProvider,
  type ScoringCriterionSpec,
  type ScoringInput
} from "@/lib/ai-quality/scoring/types";

const completionEndpoint = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";
const defaultModel = "yandexgpt";
const defaultTimeoutMs = 30_000;
const defaultMaxResponseBytes = 1_000_000;
const maxTokens = 2000;
const temperature = 0.2;

const providerName = "yandexgpt";
const modelVersion = "yandexgpt/latest";
const promptVersion = "yandexgpt-scoring-1";

export type YandexGptScoringProviderOptions = {
  apiKey: string;
  catalogId: string;
  model?: string;
  transport?: ScoringTransport;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

/**
 * YandexGPT (Yandex Foundation Models) scoring adapter.
 *
 * Calls the `foundationModels/v1/completion` REST endpoint, instructs the model
 * (in Russian) to return STRICT JSON matching the per-criterion schema, then
 * normalizes it into a `ConversationScorePrediction`. Any parse/shape failure
 * throws a `ScoringProviderError` so the AI_SCORE job can fall back to the
 * deterministic provider.
 */
export class YandexGptScoringProvider implements QualityScoringProvider {
  readonly name = providerName;
  readonly modelVersion = modelVersion;
  readonly promptVersion = promptVersion;

  private readonly apiKey: string;
  private readonly catalogId: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly client: ReturnType<typeof createScoringHttpClient>;

  constructor(options: YandexGptScoringProviderOptions) {
    this.apiKey = options.apiKey;
    this.catalogId = options.catalogId;
    this.model = options.model?.trim() || defaultModel;
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    this.maxResponseBytes = options.maxResponseBytes ?? defaultMaxResponseBytes;
    this.client = createScoringHttpClient({ provider: providerName, transport: options.transport });
  }

  async scoreConversation(input: ScoringInput): Promise<ConversationScorePrediction> {
    const body = JSON.stringify({
      modelUri: `gpt://${this.catalogId}/${this.model}/latest`,
      completionOptions: { stream: false, temperature, maxTokens },
      messages: [
        { role: "system", text: systemPrompt() },
        { role: "user", text: userPrompt(input) }
      ]
    });

    const responseText = await this.client.requestText({
      method: "POST",
      url: completionEndpoint,
      headers: {
        authorization: `Api-Key ${this.apiKey}`,
        "x-folder-id": this.catalogId,
        "content-type": "application/json"
      },
      body,
      timeoutMs: this.timeoutMs,
      maxResponseBytes: this.maxResponseBytes
    });

    const alternativeText = this.extractAlternativeText(responseText);
    const prediction = this.parsePrediction(alternativeText);

    return this.mapToInput(prediction, input);
  }

  private extractAlternativeText(responseText: string): string {
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

    const text = readAlternativeText(envelope);
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new ScoringProviderError({
        code: "malformed_payload",
        provider: providerName,
        safeMessage: "Ответ модели не содержит ожидаемого результата.",
        diagnostic: redactScoringDiagnostic({ envelope })
      });
    }

    return text;
  }

  private parsePrediction(alternativeText: string): ConversationScorePrediction {
    // The model is asked for strict JSON, but be defensive: strip a leading/trailing
    // code fence if one slipped in, then rely on the contract parser for normalization.
    const cleaned = stripCodeFence(alternativeText);
    const prediction = parseConversationScorePrediction(cleaned);

    if (!prediction) {
      throw new ScoringProviderError({
        code: "malformed_payload",
        provider: providerName,
        safeMessage: "Не удалось разобрать оценку модели.",
        diagnostic: redactScoringDiagnostic({ alternativeText: cleaned })
      });
    }

    return prediction;
  }

  private mapToInput(prediction: ConversationScorePrediction, input: ScoringInput): ConversationScorePrediction {
    const byKey = new Map<string, ScoringCriterionSpec>();
    const byId = new Map<string, ScoringCriterionSpec>();
    for (const spec of input.criteria) {
      byKey.set(spec.key, spec);
      byId.set(spec.id, spec);
    }

    const criteria: CriterionPrediction[] = [];
    for (const criterion of prediction.criteria) {
      const spec = byId.get(criterion.criterionId) ?? byKey.get(criterion.criterionKey);
      if (!spec) {
        // The model returned a criterion we did not ask about — drop it.
        continue;
      }

      const mapped: CriterionPrediction = {
        ...criterion,
        criterionId: spec.id,
        criterionKey: spec.key
      };

      // Keep only the field that matches the criterion kind to avoid mixed verdicts.
      if (spec.kind === "SCALE_1_3") {
        delete mapped.passed;
      } else {
        delete mapped.value;
      }

      criteria.push(mapped);
    }

    if (criteria.length === 0) {
      throw new ScoringProviderError({
        code: "malformed_payload",
        provider: providerName,
        safeMessage: "Оценка модели не содержит ни одного известного критерия.",
        diagnostic: redactScoringDiagnostic({ returnedKeys: prediction.criteria.map((c) => c.criterionKey) })
      });
    }

    return {
      criteria,
      overallConfidence: prediction.overallConfidence,
      summary: prediction.summary
    };
  }
}

function readAlternativeText(envelope: unknown): unknown {
  if (!envelope || typeof envelope !== "object") {
    return undefined;
  }
  const result = (envelope as Record<string, unknown>).result;
  if (!result || typeof result !== "object") {
    return undefined;
  }
  const alternatives = (result as Record<string, unknown>).alternatives;
  if (!Array.isArray(alternatives) || alternatives.length === 0) {
    return undefined;
  }
  const first = alternatives[0];
  if (!first || typeof first !== "object") {
    return undefined;
  }
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object") {
    return undefined;
  }
  return (message as Record<string, unknown>).text;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

function systemPrompt(): string {
  return [
    "Ты — ассистент контроля качества контакт-центра.",
    "Оцени диалог оператора с клиентом по заданным критериям.",
    "Верни СТРОГО валидный JSON без markdown и пояснений вне JSON.",
    "Структура: {\"criteria\":[{\"criterionKey\":string,\"value\":1..3 (только для шкальных критериев),\"passed\":boolean (только для критериев да/нет),\"isNotApplicable\":boolean,\"confidence\":0..1,\"rationale\":краткое обоснование на русском,\"evidenceRef\":id сообщения-доказательства}],\"overallConfidence\":0..1,\"summary\":краткое резюме на русском}.",
    "Для критерия типа SCALE_1_3 укажи value (1..3) и не указывай passed.",
    "Для критерия типа PASS_FAIL укажи passed (true/false) и не указывай value.",
    "criterionKey должен совпадать с ключом критерия из запроса.",
    "evidenceRef — это id сообщения из транскрипта, подтверждающего вывод."
  ].join("\n");
}

function userPrompt(input: ScoringInput): string {
  const criteriaBlock = input.criteria
    .map((spec) => `- key=${spec.key}; тип=${spec.kind}; блок=${spec.block}; критерий="${spec.label}"`)
    .join("\n");
  const transcriptBlock = input.transcript
    .map((message) => `[${message.id}] ${message.author}: ${message.text}`)
    .join("\n");

  return [
    `Тема обращения: ${input.subject}`,
    "",
    "Критерии для оценки:",
    criteriaBlock,
    "",
    "Транскрипт диалога (формат [id] автор: текст):",
    transcriptBlock,
    "",
    "Верни JSON-оценку строго по описанной схеме."
  ].join("\n");
}

function serializeError(error: unknown) {
  return error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
}
