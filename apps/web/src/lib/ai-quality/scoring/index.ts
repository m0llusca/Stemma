/**
 * Public surface of the AI quality-scoring provider layer.
 *
 * Consumers (the AI_SCORE background job, the workbench) import from
 * `@/lib/ai-quality/scoring`. `resolveScoringProvider()` selects the YandexGPT
 * adapter when credentials are configured, otherwise the deterministic
 * fallback.
 *
 * Required env vars:
 *   - YANDEX_GPT_API_KEY     — Yandex Cloud API key (Authorization: Api-Key ...)
 *   - YANDEX_GPT_CATALOG_ID  — Yandex Cloud folder/catalog id (x-folder-id)
 *   - YANDEX_GPT_MODEL       — optional model name; defaults to "yandexgpt"
 */

export * from "@/lib/ai-quality/scoring/types";
export { ScoringProviderError, type ScoringProviderErrorCode } from "@/lib/ai-quality/scoring/errors";
export {
  type ScoringTransport,
  type ScoringTransportRequest,
  type ScoringTransportResponse
} from "@/lib/ai-quality/scoring/http";
export { DeterministicScoringProvider } from "@/lib/ai-quality/scoring/deterministic-provider";
export {
  YandexGptScoringProvider,
  type YandexGptScoringProviderOptions
} from "@/lib/ai-quality/scoring/yandex-gpt-provider";

import { DeterministicScoringProvider } from "@/lib/ai-quality/scoring/deterministic-provider";
import type { QualityScoringProvider } from "@/lib/ai-quality/scoring/types";
import { YandexGptScoringProvider } from "@/lib/ai-quality/scoring/yandex-gpt-provider";

/** True when both YandexGPT credentials are present in the environment. */
export function isYandexGptConfigured(): boolean {
  return Boolean(process.env.YANDEX_GPT_API_KEY && process.env.YANDEX_GPT_CATALOG_ID);
}

/**
 * Selects the live YandexGPT adapter when credentials are configured, otherwise
 * the deterministic fallback. Read at call time so env changes take effect.
 */
export function resolveScoringProvider(): QualityScoringProvider {
  const apiKey = process.env.YANDEX_GPT_API_KEY;
  const catalogId = process.env.YANDEX_GPT_CATALOG_ID;

  if (apiKey && catalogId) {
    return new YandexGptScoringProvider({
      apiKey,
      catalogId,
      model: process.env.YANDEX_GPT_MODEL
    });
  }

  return new DeterministicScoringProvider();
}
