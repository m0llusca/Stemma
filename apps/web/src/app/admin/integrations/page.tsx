import Link from "next/link";
import { IntegrationSetupWorkspace } from "@/components/integrations/integration-setup-workspace";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { queueIntegrationImport } from "@/lib/integration-actions";
import { externalSourceLabel, integrationStatusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const emptyStateClass = "soft-callout text-sm leading-5 text-[#64748b]";

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

function formatScopes(scopes: string) {
  return scopes
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(", ");
}

function badgeClass(tone: "ok" | "warn" | "neutral") {
  const classes = {
    ok: "bg-[#edf2ff] text-[#3157d5]",
    warn: "bg-[#fff7ed] text-[#b45309]",
    neutral: "bg-[#edf2ff] text-[#1d3fae]"
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
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Интеграции</h1>
          <p className="page-subtitle">
            Подключения показывают только рабочие источники по умолчанию. Настройка, история и API-детали раскрываются по необходимости.
          </p>
        </div>
        <div className="admin-actions">
          <Link href="/admin/integrations?setup=1#connect" className="action-button action-button--primary">
            Новый источник
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
        <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-[#d9e0ea] bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Подключить источник</h2>
            <p className="mt-1 text-sm text-[#64748b]">Пошаговая настройка скрыта до момента, когда она действительно нужна.</p>
          </div>
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[#1d3fae]">Открыть</span>
        </summary>
        <div className="mt-4">
          <IntegrationSetupWorkspace apiTokenCount={apiTokens.length} apiHealth={apiHealth} />
        </div>
      </details>

      <section className="admin-group-grid admin-group-grid--wide mt-6" aria-label="Состояние интеграций">
        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Подключенные источники</h2>
            <p className="text-sm leading-5 text-[#64748b]">Только рабочие подключения и источники после dry-run.</p>
          </div>
          <div className="grid gap-2">
            {connectedIntegrations.length > 0 ? (
              connectedIntegrations.map((integration) => (
                <div key={integration.id} className="admin-tile admin-tile--compact">
                  <span className="admin-tile__icon admin-tile__icon--plain">
                    {integration.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="admin-tile__body">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="record-title record-title--tight">{integration.displayName}</span>
                      <span className="pill pill--ok">{integrationStatusLabel(integration.status)}</span>
                    </span>
                    <span className="record-meta compact-text">{externalSourceLabel(integration.source)}</span>
                    <span className="record-meta">
                      {integration.importLimit} тикетов · батч {integration.batchSize} · {formatDate(integration.lastImportAt ?? integration.lastDryRunAt)}
                    </span>
                    <form action={queueIntegrationImport} className="mt-1">
                      <input type="hidden" name="integrationId" value={integration.id} />
                      <button type="submit" className="quiet-link text-sm">Запланировать импорт</button>
                    </form>
                  </div>
                </div>
              ))
            ) : (
              <div className={emptyStateClass}>Активных подключений пока нет.</div>
            )}
          </div>
        </div>

        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Последние запуски</h2>
            <p className="text-sm leading-5 text-[#64748b]">Dry-run и импорты без отдельной раскрывающейся секции.</p>
          </div>
          <div className="grid gap-2">
            {recentRuns.length > 0 ? (
              recentRuns.slice(0, 5).map((run) => (
                <Link key={run.id} href={queueHref(run.source, [])} className="admin-tile admin-tile--compact">
                  <span className="admin-tile__icon admin-tile__icon--plain">{run.dryRun ? "D" : "I"}</span>
                  <span className="admin-tile__body">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="record-title record-title--tight">{run.integration?.displayName ?? externalSourceLabel(run.source)}</span>
                      <span className={`pill ${run.errorCount > 0 ? "pill--warn" : "pill--neutral"}`}>
                        {run.dryRun ? "Dry-run" : "Импорт"}
                      </span>
                    </span>
                    <span className="record-meta">{formatDate(run.startedAt)} · {run.actor?.name ?? "Автоматика"}</span>
                    <span className="record-meta">Импортировано {run.importedCount} · ошибок {run.errorCount}</span>
                  </span>
                </Link>
              ))
            ) : (
              <div className={emptyStateClass}>Запуски появятся после проверки подключения или импорта.</div>
            )}
          </div>
        </div>

        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">API-ключи</h2>
            <p className="text-sm leading-5 text-[#64748b]">Состояние ключей для своего API и внешних интеграций.</p>
          </div>
          <div className="grid gap-2">
            {apiTokens.length > 0 ? (
              apiTokens.slice(0, 5).map((apiToken) => (
                <Link key={apiToken.id} href="/admin/tokens" className="admin-tile admin-tile--compact">
                  <span className="admin-tile__icon admin-tile__icon--plain">K</span>
                  <span className="admin-tile__body">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="record-title record-title--tight">{apiToken.name}</span>
                      <span className={`pill ${apiToken.lastError ? "pill--warn" : "pill--neutral"}`}>
                        {apiToken.lastError ? "Ошибка" : "Готов"}
                      </span>
                    </span>
                    <span className="record-meta font-mono compact-text">{apiToken.tokenPrefix}</span>
                    <span className="record-meta compact-text">{formatScopes(apiToken.scopes)}</span>
                  </span>
                </Link>
              ))
            ) : (
              <div className={emptyStateClass}>API-ключи еще не созданы.</div>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
