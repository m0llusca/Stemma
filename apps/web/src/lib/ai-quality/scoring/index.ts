/**
 * Public surface of the AI quality-scoring provider layer.
 *
 * Consumers (the AI_SCORE background job, the workbench) import from
 * `@/lib/ai-quality/scoring`. `resolveScoringProvider(preference)` picks the
 * engine for a workspace: the preference comes from `Workspace.aiScoringProvider`
 * ("auto" | "yandexgpt" | "anthropic" | "openai" | "deterministic"); the chosen
 * provider is used only when its credentials are present, otherwise the
 * deterministic fallback runs so the seeded demo always works.
 *
 * Per-provider env vars:
 *   - YandexGPT:  YANDEX_GPT_API_KEY + YANDEX_GPT_CATALOG_ID (+ YANDEX_GPT_MODEL)
 *   - Anthropic:  ANTHROPIC_API_KEY (+ ANTHROPIC_MODEL, default claude-opus-4-8)
 *   - OpenAI:     OPENAI_API_KEY (+ OPENAI_MODEL default gpt-4o, + OPENAI_ORG_ID)
 */

export * from "@/lib/ai-quality/scoring/types";
export { ScoringProviderError, type ScoringProviderErrorCode } from "@/lib/ai-quality/scoring/errors";
export {
  type ScoringTransport,
  type ScoringTransportRequest,
  type ScoringTransportResponse
} from "@/lib/ai-quality/scoring/http";
export {
  buildScoringSystemPrompt,
  buildScoringUserPrompt,
  finalizePrediction,
  mapPredictionToInput,
  stripCodeFence
} from "@/lib/ai-quality/scoring/prompt";
export { DeterministicScoringProvider } from "@/lib/ai-quality/scoring/deterministic-provider";
export {
  YandexGptScoringProvider,
  type YandexGptScoringProviderOptions
} from "@/lib/ai-quality/scoring/yandex-gpt-provider";
export {
  AnthropicScoringProvider,
  type AnthropicScoringProviderOptions
} from "@/lib/ai-quality/scoring/anthropic-provider";
export {
  OpenAiScoringProvider,
  type OpenAiScoringProviderOptions
} from "@/lib/ai-quality/scoring/openai-provider";

import { AnthropicScoringProvider } from "@/lib/ai-quality/scoring/anthropic-provider";
import { DeterministicScoringProvider } from "@/lib/ai-quality/scoring/deterministic-provider";
import { OpenAiScoringProvider } from "@/lib/ai-quality/scoring/openai-provider";
import type { QualityScoringProvider } from "@/lib/ai-quality/scoring/types";
import { YandexGptScoringProvider } from "@/lib/ai-quality/scoring/yandex-gpt-provider";

/** Provider identities an operator can select. */
export const AI_SCORING_PROVIDER_CHOICES = ["auto", "yandexgpt", "anthropic", "openai", "deterministic"] as const;
export type AiScoringProviderChoice = (typeof AI_SCORING_PROVIDER_CHOICES)[number];

/** Concrete (constructed) provider names — what actually runs. */
export type ResolvedScoringProviderName = "yandexgpt" | "anthropic" | "openai" | "deterministic";

export function isAiScoringProviderChoice(value: unknown): value is AiScoringProviderChoice {
  return typeof value === "string" && (AI_SCORING_PROVIDER_CHOICES as readonly string[]).includes(value);
}

/** True when both YandexGPT credentials are present in the environment. */
export function isYandexGptConfigured(): boolean {
  return Boolean(process.env.YANDEX_GPT_API_KEY && process.env.YANDEX_GPT_CATALOG_ID);
}

function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Pure: which provider WOULD run for the given preference, given current env —
 * without constructing it. Used by readiness/diagnostics and the admin UI.
 */
export function resolveAiScoringProviderName(preference?: string): ResolvedScoringProviderName {
  const pref = (preference ?? "auto").trim().toLowerCase();

  if (pref === "deterministic") {
    return "deterministic";
  }

  if (pref === "yandexgpt") {
    return isYandexGptConfigured() ? "yandexgpt" : "deterministic";
  }
  if (pref === "anthropic") {
    return isAnthropicConfigured() ? "anthropic" : "deterministic";
  }
  if (pref === "openai") {
    return isOpenAiConfigured() ? "openai" : "deterministic";
  }

  // "auto" or unknown: first configured wins, deterministic otherwise.
  if (isYandexGptConfigured()) {
    return "yandexgpt";
  }
  if (isAnthropicConfigured()) {
    return "anthropic";
  }
  if (isOpenAiConfigured()) {
    return "openai";
  }
  return "deterministic";
}

/**
 * Selects and constructs the scoring provider for a workspace preference.
 * Reads env at call time so credential/setting changes take effect without a
 * restart.
 */
export function resolveScoringProvider(preference?: string): QualityScoringProvider {
  switch (resolveAiScoringProviderName(preference)) {
    case "yandexgpt":
      return new YandexGptScoringProvider({
        apiKey: process.env.YANDEX_GPT_API_KEY as string,
        catalogId: process.env.YANDEX_GPT_CATALOG_ID as string,
        model: process.env.YANDEX_GPT_MODEL
      });
    case "anthropic":
      return new AnthropicScoringProvider({
        apiKey: process.env.ANTHROPIC_API_KEY as string,
        model: process.env.ANTHROPIC_MODEL
      });
    case "openai":
      return new OpenAiScoringProvider({
        apiKey: process.env.OPENAI_API_KEY as string,
        model: process.env.OPENAI_MODEL,
        organization: process.env.OPENAI_ORG_ID
      });
    default:
      return new DeterministicScoringProvider();
  }
}
