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

/**
 * Provider credentials sourced from per-workspace storage (the DB). Any field
 * left empty falls back to the corresponding environment variable, so an
 * operator can configure keys in the UI without ever editing .env by hand.
 */
export type AiProviderCredentialInput = {
  yandexgpt?: { apiKey?: string | null; catalogId?: string | null; model?: string | null };
  anthropic?: { apiKey?: string | null; model?: string | null };
  openai?: { apiKey?: string | null; organization?: string | null; model?: string | null };
};

type EffectiveCredentials = {
  yandexgpt?: { apiKey: string; catalogId: string; model?: string };
  anthropic?: { apiKey: string; model?: string };
  openai?: { apiKey: string; organization?: string; model?: string };
};

function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Merges injected (DB) credentials over environment variables and keeps only the
 * providers that are fully configured (YandexGPT needs both key and catalog id).
 */
function effectiveCredentials(credentials?: AiProviderCredentialInput): EffectiveCredentials {
  const result: EffectiveCredentials = {};

  const yandexApiKey = firstNonEmpty(credentials?.yandexgpt?.apiKey, process.env.YANDEX_GPT_API_KEY);
  const yandexCatalog = firstNonEmpty(credentials?.yandexgpt?.catalogId, process.env.YANDEX_GPT_CATALOG_ID);
  if (yandexApiKey && yandexCatalog) {
    result.yandexgpt = {
      apiKey: yandexApiKey,
      catalogId: yandexCatalog,
      model: firstNonEmpty(credentials?.yandexgpt?.model, process.env.YANDEX_GPT_MODEL)
    };
  }

  const anthropicApiKey = firstNonEmpty(credentials?.anthropic?.apiKey, process.env.ANTHROPIC_API_KEY);
  if (anthropicApiKey) {
    result.anthropic = {
      apiKey: anthropicApiKey,
      model: firstNonEmpty(credentials?.anthropic?.model, process.env.ANTHROPIC_MODEL)
    };
  }

  const openaiApiKey = firstNonEmpty(credentials?.openai?.apiKey, process.env.OPENAI_API_KEY);
  if (openaiApiKey) {
    result.openai = {
      apiKey: openaiApiKey,
      organization: firstNonEmpty(credentials?.openai?.organization, process.env.OPENAI_ORG_ID),
      model: firstNonEmpty(credentials?.openai?.model, process.env.OPENAI_MODEL)
    };
  }

  return result;
}

/**
 * Pure: which provider WOULD run for the given preference and credentials —
 * without constructing it. Credentials default to env-only. Used by
 * readiness/diagnostics and the admin UI.
 */
export function resolveAiScoringProviderName(
  preference?: string,
  credentials?: AiProviderCredentialInput
): ResolvedScoringProviderName {
  const pref = (preference ?? "auto").trim().toLowerCase();
  const eff = effectiveCredentials(credentials);

  if (pref === "deterministic") {
    return "deterministic";
  }
  if (pref === "yandexgpt") {
    return eff.yandexgpt ? "yandexgpt" : "deterministic";
  }
  if (pref === "anthropic") {
    return eff.anthropic ? "anthropic" : "deterministic";
  }
  if (pref === "openai") {
    return eff.openai ? "openai" : "deterministic";
  }

  // "auto" or unknown: first configured wins, deterministic otherwise.
  if (eff.yandexgpt) {
    return "yandexgpt";
  }
  if (eff.anthropic) {
    return "anthropic";
  }
  if (eff.openai) {
    return "openai";
  }
  return "deterministic";
}

/**
 * Selects and constructs the scoring provider for a workspace preference.
 * Credentials (DB) take precedence over env and are read at call time, so
 * changes take effect without a restart.
 */
export function resolveScoringProvider(
  preference?: string,
  credentials?: AiProviderCredentialInput
): QualityScoringProvider {
  const eff = effectiveCredentials(credentials);

  switch (resolveAiScoringProviderName(preference, credentials)) {
    case "yandexgpt":
      return new YandexGptScoringProvider({
        apiKey: eff.yandexgpt!.apiKey,
        catalogId: eff.yandexgpt!.catalogId,
        model: eff.yandexgpt!.model
      });
    case "anthropic":
      return new AnthropicScoringProvider({
        apiKey: eff.anthropic!.apiKey,
        model: eff.anthropic!.model
      });
    case "openai":
      return new OpenAiScoringProvider({
        apiKey: eff.openai!.apiKey,
        model: eff.openai!.model,
        organization: eff.openai!.organization
      });
    default:
      return new DeterministicScoringProvider();
  }
}
