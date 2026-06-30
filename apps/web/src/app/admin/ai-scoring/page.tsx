import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { StatusBadge } from "@/components/ui/status-badge";
import { AiProviderKeyForm, type AiProviderKeyExtraField } from "@/components/admin/ai-provider-key-form";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { resolveAiScoringProviderName } from "@/lib/ai-quality/scoring";
import { saveAiScoringProvider } from "@/lib/ai-scoring-settings-actions";
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
  extraFields: (view: AiCredentialView) => AiProviderKeyExtraField[];
};

const PROVIDER_META: ProviderMeta[] = [
  {
    provider: "yandexgpt",
    name: "YandexGPT",
    extraFields: (view) => [
      { name: "catalogId", label: "ID каталога", defaultValue: view.catalogId ?? "", placeholder: "b1g..." },
      { name: "model", label: "Модель (необязательно)", defaultValue: view.model ?? "", placeholder: "yandexgpt/latest" }
    ]
  },
  {
    provider: "anthropic",
    name: "Claude (Anthropic)",
    extraFields: (view) => [
      { name: "model", label: "Модель (необязательно)", defaultValue: view.model ?? "", placeholder: "claude-opus-4-8" }
    ]
  },
  {
    provider: "openai",
    name: "ChatGPT (OpenAI)",
    extraFields: (view) => [
      { name: "model", label: "Модель (необязательно)", defaultValue: view.model ?? "", placeholder: "gpt-4o" },
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

  return (
    <PageShell
      eyebrow="Администрирование"
      title="AI-оценка"
      description="Движок автоскоринга диалогов: YandexGPT, Claude (Anthropic) или ChatGPT (OpenAI). Ключи задаются прямо здесь — они шифруются и хранятся в базе по рабочему пространству, поэтому править .env вручную не нужно. Если ключ не задан, оценка переходит на детерминированный fallback без обращения к сети."
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
          <div className="px-5 pb-5">
            <p className="text-sm leading-5 text-[var(--text-muted)]">
              При выборе «Авто» берётся первый настроенный провайдер в порядке YandexGPT → Claude → ChatGPT, иначе детерминированный fallback. Ключи задаются ниже.
            </p>
            <form action={saveAiScoringProvider} className="mt-3 flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
                Движок оценки
                <select name="provider" defaultValue={currentScoringProvider} className="form-control">
                  <option value="auto">Авто (первый настроенный)</option>
                  <option value="yandexgpt">YandexGPT</option>
                  <option value="anthropic">Claude (Anthropic)</option>
                  <option value="openai">ChatGPT (OpenAI)</option>
                  <option value="deterministic">Детерминированный (без сети)</option>
                </select>
              </label>
              <button type="submit" className="action-button action-button--primary">Сохранить</button>
            </form>
          </div>
        </section>

        <section className="ops-panel" aria-labelledby="ai-keys-title">
          <div className="ops-panel__header">
            <div className="min-w-0">
              <p className="ops-panel__eyebrow">Доступы</p>
              <h2 id="ai-keys-title" className="ops-panel__title">Ключи провайдеров</h2>
              <p className="ops-panel__subtitle">Хранятся в зашифрованном виде в БД. Применяются сразу, без перезапуска. Переменные окружения остаются запасным вариантом.</p>
            </div>
          </div>
          <div className="record-list p-5 pt-0">
            {PROVIDER_META.map((meta) => {
              const view = views[meta.provider];
              const status = credentialStatus(view);

              return (
                <article key={meta.provider} className="record-card">
                  <div className="record-row">
                    <div className="min-w-0">
                      <h3 className="record-title">{meta.name}</h3>
                      <p className="record-meta mt-1">
                        {view.hasDbKey
                          ? `Сохранён ключ ${view.maskedDbKey}.`
                          : view.hasEnvKey
                            ? "Используется ключ из переменных окружения."
                            : "Ключ ещё не задан."}
                      </p>
                    </div>
                    <StatusBadge label="Ключ" value={status.label} tone={status.tone} />
                  </div>
                  <AiProviderKeyForm
                    provider={meta.provider}
                    maskedDbKey={view.maskedDbKey}
                    hasEnvKey={view.hasEnvKey}
                    extraFields={meta.extraFields(view)}
                  />
                </article>
              );
            })}
          </div>
        </section>
      </AdminFrame>
    </PageShell>
  );
}
