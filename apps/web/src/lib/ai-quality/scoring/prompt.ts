import { ScoringProviderError } from "@/lib/ai-quality/scoring/errors";
import { redactScoringDiagnostic } from "@/lib/ai-quality/scoring/http";
import {
  parseConversationScorePrediction,
  type ConversationScorePrediction,
  type CriterionPrediction,
  type ScoringCriterionSpec,
  type ScoringInput
} from "@/lib/ai-quality/scoring/types";

/**
 * Provider-agnostic scoring prompt + response normalization, shared by the
 * YandexGPT, Anthropic (Claude), and OpenAI (ChatGPT) adapters so every engine
 * is asked for the exact same strict-JSON schema and mapped identically.
 *
 * NOTE: the system prompt must contain the literal word "JSON" — OpenAI's
 * json_object response format requires it to appear in the messages.
 */

export function buildScoringSystemPrompt(): string {
  return [
    "Ты — ассистент контроля качества контакт-центра.",
    "Оцени диалог оператора с клиентом по заданным критериям.",
    "Верни СТРОГО валидный JSON без markdown и пояснений вне JSON.",
    "Структура: {\"criteria\":[{\"criterionKey\":string,\"value\":1..3 (только для шкальных критериев),\"passed\":boolean (только для критериев да/нет),\"isNotApplicable\":boolean,\"confidence\":0..1,\"rationale\":краткое обоснование на русском,\"evidenceRef\":id сообщения-доказательства}],\"overallConfidence\":0..1,\"summary\":краткое резюме на русском,\"sentiment\":{\"label\":\"positive|neutral|negative\",\"score\":0..1}}.",
    "Для критерия типа SCALE_1_3 укажи value (1..3) и не указывай passed.",
    "Для критерия типа PASS_FAIL укажи passed (true/false) и не указывай value.",
    "criterionKey должен совпадать с ключом критерия из запроса.",
    "evidenceRef — это id сообщения из транскрипта, подтверждающего вывод.",
    "sentiment — общая тональность диалога клиента: label из набора positive/neutral/negative, score (0..1) — уверенность в тональности."
  ].join("\n");
}

export function buildScoringUserPrompt(input: ScoringInput): string {
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

export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

/**
 * Parse a raw model text answer into a `ConversationScorePrediction` bound to
 * the requested criteria. Tolerates an accidental code fence. Throws a
 * `ScoringProviderError` (so the job falls back) when the text is unparseable or
 * no requested criterion survives.
 */
export function finalizePrediction(
  rawText: string,
  input: ScoringInput,
  providerName: string
): ConversationScorePrediction {
  const cleaned = stripCodeFence(rawText);
  const prediction = parseConversationScorePrediction(cleaned);

  if (!prediction) {
    throw new ScoringProviderError({
      code: "malformed_payload",
      provider: providerName,
      safeMessage: "Не удалось разобрать оценку модели.",
      diagnostic: redactScoringDiagnostic({ alternativeText: cleaned })
    });
  }

  return mapPredictionToInput(prediction, input, providerName);
}

/**
 * Match the model's returned criteria back to the requested criteria by id/key,
 * drop unknown ones, keep only the field that matches the criterion kind
 * (value for SCALE_1_3, passed for PASS_FAIL), and carry sentiment through.
 */
export function mapPredictionToInput(
  prediction: ConversationScorePrediction,
  input: ScoringInput,
  providerName: string
): ConversationScorePrediction {
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
    summary: prediction.summary,
    // Carry sentiment through when the model emitted it; tolerate its absence.
    ...(prediction.sentiment ? { sentiment: prediction.sentiment } : {})
  };
}
