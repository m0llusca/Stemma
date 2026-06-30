import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AiProviderKeyExtraField } from "@/components/admin/ai-provider-key-form";
import { AiScoringEnginePanel, type AiProviderConfig } from "@/components/admin/ai-scoring-engine-panel";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { resolveAiScoringProviderName } from "@/lib/ai-quality/scoring";
import {
  loadWorkspaceAiCredentials,
  loadWorkspaceAiCredentialViews,
  type AiCredentialProvider,
  type AiCredentialView
} from "@/lib/ai-quality/credentials";
import type { StatusTone } from "@/lib/ui/status-tone";

export const dynamic = "force-dynamic";

const scoringProviderLabels: Record<string, string> = {
  yandexgpt: "YandexGPT",
  anthropic: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  deterministic: "детерминированный (без сети)"
};

type ProviderMeta = {
  provider: AiCredentialProvider;
  name: string;
  modelOptions: string[];
  modelPlaceholder: string;
  textFields: (view: AiCredentialView) => AiProviderKeyExtraField[];
};

const PROVIDER_META: ProviderMeta[] = [
  {
    provider: "yandexgpt",
    name: "YandexGPT",
    modelOptions: ["yandexgpt/latest", "yandexgpt-lite/latest", "yandexgpt-32k/latest"],
    modelPlaceholder: "yandexgpt/latest",
    textFields: (view) => [
      { name: "catalogId", label: "ID каталога", defaultValue: view.catalogId ?? "", placeholder: "b1g..." }
    ]
  },
  {
    provider: "anthropic",
    name: "Claude (Anthropic)",
    modelOptions: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
    modelPlaceholder: "claude-opus-4-8",
    textFields: () => []
  },
  {
    provider: "openai",
    name: "ChatGPT (OpenAI)",
    modelOptions: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"],
    modelPlaceholder: "gpt-4o",
    textFields: (view) => [
      { name: "organization", label: "Organization ID (необязательно)", defaultValue: view.organization ?? "", placeholder: "org-..." }
    ]
  }
];

function credentialStatus(view: AiCredentialView): { label: string; tone: StatusTone } {
  if (view.hasDbKey) {
    return { label: "Ключ задан", tone: "positive" };
  }
  if (view.hasEnvKey) {
    return { label: "Из окружения", tone: "info" };
  }
  return { label: "Не задан", tone: "neutral" };
}

function providerSummary(view: AiCredentialView): string {
  if (view.hasDbKey) {
    return `Сохранён ключ ${view.maskedDbKey}.`;
  }
  if (view.hasEnvKey) {
    return "Используется ключ из переменных окружения.";
  }
  return "Ключ ещё не задан.";
}

export default function AdminAiScoringPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label="Загрузка настроек AI-оценки" />}>
      <AdminAiScoringPageContent />
    </Suspense>
  );
}

async function AdminAiScoringPageContent() {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  const [workspaceSettings, credentials, views] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: user.workspaceId },
      select: { aiScoringProvider: true }
    }),
    loadWorkspaceAiCredentials(user.workspaceId),
    loadWorkspaceAiCredentialViews(user.workspaceId)
  ]);
  const currentScoringProvider = workspaceSettings?.aiScoringProvider ?? "auto";
  const activeScoringProvider = resolveAiScoringProviderName(currentScoringProvider, credentials);
  const usingFallback = activeScoringProvider === "deterministic";

  const providers: AiProviderConfig[] = PROVIDER_META.map((meta) => {
    const view = views[meta.provider];
    const status = credentialStatus(view);
    return {
      provider: meta.provider,
      name: meta.name,
      summary: providerSummary(view),
      statusLabel: status.label,
      statusTone: status.tone,
      maskedDbKey: view.maskedDbKey,
      hasEnvKey: view.hasEnvKey,
      extraFields: meta.textFields(view),
      modelField: { value: view.model ?? "", options: meta.modelOptions, placeholder: meta.modelPlaceholder }
    };
  });

  return (
    <PageShell
      eyebrow="Администрирование"
      title="AI-оценка"
      description="Движок автоскоринга диалогов: YandexGPT, Claude (Anthropic) или ChatGPT (OpenAI). Выберите движок — его ключ и модель настраиваются тут же. Ключи шифруются и хранятся в базе по рабочему пространству, поэтому править .env вручную не нужно. Если ключ не задан, оценка переходит на детерминированный fallback без обращения к сети."
      actions={
        <Link href="/admin" className="action-button">
          <ArrowLeft size={16} aria-hidden="true" />
          К настройкам
        </Link>
      }
    >
      <AdminFrame>
        <section className="ops-panel" aria-labelledby="ai-scoring-title">
          <div className="ops-panel__header">
            <div className="min-w-0">
              <p className="ops-panel__eyebrow">Автоскоринг</p>
              <h2 id="ai-scoring-title" className="ops-panel__title">Движок AI-оценки</h2>
              <p className="ops-panel__subtitle">
                Сейчас активен: {scoringProviderLabels[activeScoringProvider] ?? activeScoringProvider}.
              </p>
            </div>
            <StatusBadge
              label="Состояние"
              value={usingFallback ? "Fallback" : "Провайдер активен"}
              tone={usingFallback ? "warning" : "positive"}
            />
          </div>
          <AiScoringEnginePanel currentEngine={currentScoringProvider} providers={providers} />
        </section>
      </AdminFrame>
    </PageShell>
  );
}
