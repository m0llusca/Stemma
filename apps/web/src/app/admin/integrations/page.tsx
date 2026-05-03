import Link from "next/link";
import { IntegrationSetupWorkspace } from "@/components/integrations/integration-setup-workspace";
import { Surface } from "@/components/integrations/integration-ui";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { queueIntegrationImport } from "@/lib/integration-actions";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const emptyStateClass = "soft-callout text-sm leading-5 text-[#667085]";

type AdminIntegrationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function formatDate(value: Date | null) {
  if (!value) {
    return "Не синхронизировалось";
  }

  return value.toLocaleString("ru-RU");
}

function formatLastUsed(value: Date | null) {
  if (!value) {
    return "Еще не использовался";
  }

  return value.toLocaleString("ru-RU");
}

function formatOptionalDate(value: Date | null) {
  if (!value) {
    return "Нет";
  }

  return value.toLocaleString("ru-RU");
}

function formatScopes(scopes: string) {
  return scopes
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(", ");
}

function badgeClass(tone: "ok" | "warn" | "neutral") {
  const classes = {
    ok: "bg-[#e8f3ef] text-[#116466]",
    warn: "bg-[#fff4ed] text-[#b54708]",
    neutral: "bg-[#eef4f4] text-[#0b4f52]"
  };

  return classes[tone];
}

function customApiHealth(
  apiTokens: Array<{ lastSuccessAt: Date | null; lastErrorAt: Date | null; lastError: string | null }>
) {
  const hasCurrentError = apiTokens.some(
    (token) => token.lastError && token.lastErrorAt && (!token.lastSuccessAt || token.lastErrorAt > token.lastSuccessAt)
  );

  if (hasCurrentError) {
    return { label: "Есть ошибка", className: badgeClass("warn") };
  }

  if (apiTokens.some((token) => token.lastSuccessAt)) {
    return { label: "Работает", className: badgeClass("ok") };
  }

  return { label: "Готов", className: badgeClass("neutral") };
}

function parseImportMetadata(value: string) {
  try {
    const parsed = JSON.parse(value) as {
      source?: string;
      sourceLabel?: string;
      count?: number;
      estimatedCount?: number;
      dryRun?: boolean;
      externalIds?: string[];
      baseUrl?: string;
    };

    return {
      source: parsed.source ?? "otrs_family",
      sourceLabel: parsed.sourceLabel,
      count:
        typeof parsed.count === "number"
          ? parsed.count
          : typeof parsed.estimatedCount === "number"
            ? parsed.estimatedCount
            : 0,
      dryRun: Boolean(parsed.dryRun),
      externalIds: Array.isArray(parsed.externalIds) ? parsed.externalIds : [],
      baseUrl: parsed.baseUrl
    };
  } catch {
    return {
      source: "otrs_family",
      sourceLabel: undefined,
      count: 0,
      dryRun: false,
      externalIds: [],
      baseUrl: undefined
    };
  }
}

function queueHref(source: string, externalIds: string[]) {
  const params = new URLSearchParams({ source });
  const firstExternalId = externalIds[0];

  if (firstExternalId) {
    params.set("q", firstExternalId);
  }

  return `/reviews?${params.toString()}`;
}

export default async function AdminIntegrationsPage({ searchParams }: AdminIntegrationsPageProps) {
  const params = await searchParams;
  const user = await requireCurrentUserPermission("integrations:manage");
  const [integrations, apiTokens, recentRuns] = await Promise.all([
    prisma.integration.findMany({
      where: {
        workspaceId: user.workspaceId
      },
      orderBy: {
        displayName: "asc"
      }
    }),
    prisma.apiToken.findMany({
      where: {
        workspaceId: user.workspaceId
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.integrationRun.findMany({
      where: {
        workspaceId: user.workspaceId
      },
      include: {
        actor: true,
        integration: true
      },
      orderBy: {
        startedAt: "desc"
      },
      take: 8
    })
  ]);
  const apiHealth = customApiHealth(apiTokens);
  const connectedIntegrations = integrations.filter((integration) => integration.status === "active" || integration.lastDryRunAt);
  const shouldOpenSetup = firstParam(params.setup) === "1";

  return (
    <section className="page-shell admin-shell">
      <div className="admin-hero">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Интеграции</h1>
          <p className="page-subtitle">
            Подключения показывают только рабочие источники по умолчанию. Настройка, история и API-детали раскрываются по необходимости.
          </p>
        </div>
        <div className="admin-actions">
          <Link href="/admin/integrations?setup=1#connect" className="action-button action-button--primary">
            Подключить источник
          </Link>
          <Link href="/admin/tokens" className="action-button">
            API-доступ
          </Link>
          <Link href="/reviews" className="action-button action-button--quiet">
            Очередь проверок
          </Link>
        </div>
      </div>

      <details id="connect" className="disclosure-panel" open={shouldOpenSetup}>
        <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-[#d7dce5] bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Подключить источник</h2>
            <p className="mt-1 text-sm text-[#667085]">Пошаговая настройка скрыта до момента, когда она действительно нужна.</p>
          </div>
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[#0b4f52]">Открыть</span>
        </summary>
        <div className="mt-4">
          <IntegrationSetupWorkspace apiTokenCount={apiTokens.length} apiHealth={apiHealth} />
        </div>
      </details>

      <div className="mt-6 grid gap-6">
        <Surface
          title="Подключенные источники"
          description="Компактный список источников, у которых был пробный запуск или включен импорт."
        >
          {connectedIntegrations.length > 0 ? (
            <div className="record-list">
              {connectedIntegrations.map((integration) => (
                <article key={integration.id} className="record-card">
                  <div className="record-row">
                    <div className="min-w-0">
                      <h3 className="record-title">{integration.displayName}</h3>
                      <p className="record-meta mt-1 compact-text">{externalSourceLabel(integration.source)}</p>
                    </div>
                    <span className="pill pill--ok">
                      {integrationStatusLabel(integration.status)}
                    </span>
                  </div>
                  <div className="record-row">
                    <p className="record-meta">
                      Лимит: {integration.importLimit} тикетов · батч {integration.batchSize} · последний запуск:{" "}
                      {formatDate(integration.lastImportAt ?? integration.lastDryRunAt)}
                    </p>
                    <form action={queueIntegrationImport}>
                      <input type="hidden" name="integrationId" value={integration.id} />
                      <button type="submit" className="action-button min-h-[36px] px-3 py-2 text-sm">
                        Запланировать
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={emptyStateClass}>
              Активных подключений пока нет.
            </div>
          )}
        </Surface>

        <details className="disclosure-panel">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-[#d7dce5] bg-white px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Последние запуски</h2>
              <p className="mt-1 text-sm text-[#667085]">Пробные запуски и импорты можно открыть при разборе ошибок или сверке объемов.</p>
            </div>
            <span className="shrink-0 rounded-md bg-[#eef4f4] px-2 py-1 text-xs font-semibold text-[#0b4f52]">{recentRuns.length}</span>
          </summary>
          <div className="mt-4">
            {recentRuns.length > 0 ? (
              <Surface
                title="Последние запуски"
                description="Пробные запуски и успешные импорты: объем, источник и быстрый переход в очередь."
              >
                <div className="record-list">
                  {recentRuns.map((run) => (
                    <article key={run.id} className="record-card">
                      <div className="record-row">
                        <div className="min-w-0">
                          <h3 className="record-title">{run.integration?.displayName ?? externalSourceLabel(run.source)}</h3>
                          <p className="record-meta mt-1">
                            {formatDate(run.startedAt)} · {run.actor?.name ?? "Автоматика"}
                          </p>
                        </div>
                        <span className={`pill ${run.errorCount > 0 ? "pill--warn" : "pill--ok"}`}>
                          {run.dryRun ? "Пробный запуск" : "Импорт"}
                        </span>
                      </div>
                      <div className="record-row">
                        <p className="record-meta">
                          Импортировано: <strong className="text-[#17202a]">{run.importedCount}</strong> · ошибок: {run.errorCount}
                        </p>
                        <Link href={queueHref(run.source, [])} className="text-sm font-semibold text-[#0b4f52] hover:underline">
                          Открыть очередь
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </Surface>
            ) : (
              <Surface
                title="Последние запуски"
                description="Пробные запуски и успешные импорты через готовые адаптеры появятся здесь после запуска."
              >
                <div className={emptyStateClass}>
                  Запуски появятся здесь после пробного запуска, готового адаптера или своего API.
                </div>
              </Surface>
            )}
          </div>
        </details>

        <details className="disclosure-panel">
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-[#d7dce5] bg-white px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Ключи API</h2>
              <p className="mt-1 text-sm text-[#667085]">Состояние ключей и последняя ошибка по своему API.</p>
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs font-semibold uppercase text-[#667085]">Показать</span>
          </summary>
          <div className="mt-4">
            <Surface
              title="Ключи API"
              description="Состояние ключей помогает понять, был ли успешный импорт или свежая ошибка."
            >
              <div className="record-list">
                {apiTokens.map((apiToken) => (
                  <article key={apiToken.id} className="record-card">
                    <div className="record-row">
                      <div className="min-w-0">
                        <h3 className="record-title">{apiToken.name}</h3>
                        <p className="record-meta mt-1 font-mono compact-text">{apiToken.tokenPrefix}</p>
                      </div>
                      <span className={`pill ${apiToken.lastError ? "pill--warn" : "pill--neutral"}`}>
                        {apiToken.lastError ? "Есть ошибка" : "Готов"}
                      </span>
                    </div>
                    <p className="record-meta compact-text">Права доступа: {formatScopes(apiToken.scopes)}</p>
                    <p className="record-meta">
                      Использование: {formatLastUsed(apiToken.lastUsedAt)} · успех: {formatOptionalDate(apiToken.lastSuccessAt)}
                    </p>
                    {apiToken.lastError ? (
                      <p className="text-sm font-medium text-[#b42318]">
                        {formatOptionalDate(apiToken.lastErrorAt)} · {apiToken.lastError}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </Surface>
          </div>
        </details>
      </div>
    </section>
  );
}
