import type { AiProviderCredentialInput } from "@/lib/ai-quality/scoring";
import { prisma } from "@/lib/db";
import { decryptSecret, maskSecret } from "@/lib/secrets";

/**
 * Per-workspace AI provider credentials stored in the DB (AiProviderCredential).
 * The API key is encrypted at rest; non-secret extras live in configJson. These
 * take precedence over environment variables in the scoring resolver, letting an
 * operator set keys from /admin/ai-scoring without ever editing .env.
 */
export const AI_CREDENTIAL_PROVIDERS = ["yandexgpt", "anthropic", "openai"] as const;
export type AiCredentialProvider = (typeof AI_CREDENTIAL_PROVIDERS)[number];

export function isAiCredentialProvider(value: unknown): value is AiCredentialProvider {
  return typeof value === "string" && (AI_CREDENTIAL_PROVIDERS as readonly string[]).includes(value);
}

type StoredConfig = { catalogId?: string; model?: string; organization?: string };

function parseConfig(json: string | null | undefined): StoredConfig {
  if (!json) {
    return {};
  }
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") {
      const cfg = parsed as Record<string, unknown>;
      const pick = (key: string) => (typeof cfg[key] === "string" ? (cfg[key] as string) : undefined);
      return { catalogId: pick("catalogId"), model: pick("model"), organization: pick("organization") };
    }
  } catch {
    // Malformed config — treat as unset rather than throwing in the admin view.
  }
  return {};
}

function safeDecrypt(ref: string | null | undefined): string | undefined {
  if (!ref) {
    return undefined;
  }
  try {
    return decryptSecret(ref);
  } catch {
    // A key encrypted under a different QC_SECRET_KEY can't be read — treat as unset.
    return undefined;
  }
}

/** DB-stored credentials shaped for resolveScoringProvider (env fallback applied downstream). */
export async function loadWorkspaceAiCredentials(workspaceId: string): Promise<AiProviderCredentialInput> {
  const rows = await prisma.aiProviderCredential.findMany({ where: { workspaceId } });
  const out: AiProviderCredentialInput = {};
  for (const row of rows) {
    const cfg = parseConfig(row.configJson);
    const apiKey = safeDecrypt(row.secretRef);
    if (row.provider === "yandexgpt") {
      out.yandexgpt = { apiKey, catalogId: cfg.catalogId, model: cfg.model };
    } else if (row.provider === "anthropic") {
      out.anthropic = { apiKey, model: cfg.model };
    } else if (row.provider === "openai") {
      out.openai = { apiKey, organization: cfg.organization, model: cfg.model };
    }
  }
  return out;
}

export type AiCredentialView = {
  provider: AiCredentialProvider;
  hasDbKey: boolean;
  maskedDbKey: string | null;
  hasEnvKey: boolean;
  catalogId: string | null;
  model: string | null;
  organization: string | null;
};

function envKeyPresent(provider: AiCredentialProvider): boolean {
  if (provider === "yandexgpt") {
    return Boolean(process.env.YANDEX_GPT_API_KEY && process.env.YANDEX_GPT_CATALOG_ID);
  }
  if (provider === "anthropic") {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Per-provider view for the admin UI: masked DB key, stored extras, env fallback presence. */
export async function loadWorkspaceAiCredentialViews(
  workspaceId: string
): Promise<Record<AiCredentialProvider, AiCredentialView>> {
  const rows = await prisma.aiProviderCredential.findMany({ where: { workspaceId } });
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  const view = (provider: AiCredentialProvider): AiCredentialView => {
    const row = byProvider.get(provider);
    const cfg = parseConfig(row?.configJson);
    const apiKey = safeDecrypt(row?.secretRef);
    return {
      provider,
      hasDbKey: Boolean(apiKey),
      maskedDbKey: apiKey ? maskSecret(apiKey) : null,
      hasEnvKey: envKeyPresent(provider),
      catalogId: cfg.catalogId ?? null,
      model: cfg.model ?? null,
      organization: cfg.organization ?? null
    };
  };

  return {
    yandexgpt: view("yandexgpt"),
    anthropic: view("anthropic"),
    openai: view("openai")
  };
}
