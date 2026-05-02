import Link from "next/link";
import { IntegrationSetupWorkspace } from "@/components/integrations/integration-setup-workspace";
import { DataTable, Surface } from "@/components/integrations/integration-ui";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { integrationStatusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const emptyStateClass = "rounded-md border border-dashed border-[#d7dce5] bg-[#fbfcfd] p-4 text-sm leading-5 text-[#667085]";

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

export default async function AdminIntegrationsPage() {
  const user = await getCurrentUser();
  const [integrations, apiTokens, recentImportLogs] = await Promise.all([
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
    prisma.auditLog.findMany({
      where: {
        workspaceId: user.workspaceId,
        action: {
          in: ["integration.otrs_family_imported", "integration.native_helpdesk_imported", "integration.dry_run_checked"]
        },
        targetType: "integration"
      },
      include: {
        actor: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 5
    })
  ]);
  const apiHealth = customApiHealth(apiTokens);
  const connectedIntegrations = integrations.filter((integration) => integration.status === "active");

  return (
    <section className="page-shell">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#667085]">Администрирование</p>
        <h1 className="mt-1 text-2xl font-semibold">Интеграции</h1>
      </div>

      <IntegrationSetupWorkspace apiTokenCount={apiTokens.length} apiHealth={apiHealth} />

      <div className="mt-6 grid gap-6">
        {recentImportLogs.length > 0 ? (
          <DataTable
            title="Последние запуски"
            description="Dry-run и успешные импорты: объем, источник и быстрый переход в очередь."
            minWidth="min-w-[820px]"
          >
            <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
              <tr>
                <th className="px-5 py-3 font-semibold">Дата</th>
                <th className="px-5 py-3 font-semibold">Режим</th>
                <th className="px-5 py-3 font-semibold">Источник</th>
                <th className="px-5 py-3 font-semibold">Тикеты</th>
                <th className="px-5 py-3 font-semibold">Ошибки</th>
                <th className="px-5 py-3 font-semibold">Запустил</th>
                <th className="px-5 py-3 font-semibold">Очередь</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d7dce5] bg-white">
              {recentImportLogs.map((log) => {
                const metadata = parseImportMetadata(log.metadata);

                return (
                  <tr key={log.id}>
                    <td className="px-5 py-4 text-[#344054]">{formatDate(log.createdAt)}</td>
                    <td className="px-5 py-4 text-[#344054]">{metadata.dryRun ? "Dry-run" : "Импорт"}</td>
                    <td className="px-5 py-4 text-[#344054]">{metadata.sourceLabel ?? metadata.source}</td>
                    <td className="px-5 py-4 font-semibold text-[#17202a]">{metadata.count}</td>
                    <td className="px-5 py-4 text-[#344054]">0</td>
                    <td className="px-5 py-4 text-[#344054]">{log.actor.name}</td>
                    <td className="px-5 py-4">
                      <Link
                        href={queueHref(metadata.source, metadata.externalIds)}
                        className="font-semibold text-[#0b4f52] hover:underline"
                      >
                        {metadata.dryRun ? "Очередь" : "Открыть"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : (
          <Surface
            title="Последние запуски"
            description="Dry-run и успешные импорты через готовые адаптеры появятся здесь после запуска."
          >
            <div className={emptyStateClass}>
              Запуски появятся здесь после dry-run, готового адаптера или своего API.
            </div>
          </Surface>
        )}

        <Surface
          title="Подключенные источники"
          description="Показываем только активные подключения. Остальные варианты выбираются в мастере выше."
        >
          {connectedIntegrations.length > 0 ? (
            <div className="grid gap-2">
              <div className="hidden grid-cols-[minmax(0,1fr)_120px_220px] gap-3 px-3 text-xs font-semibold uppercase text-[#667085] md:grid">
                <span>Название</span>
                <span>Статус</span>
                <span>Последняя синхронизация</span>
              </div>
              {connectedIntegrations.map((integration) => (
                <div
                  key={integration.id}
                  className="grid gap-3 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3 text-sm md:grid-cols-[minmax(0,1fr)_120px_220px] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-[#17202a]">{integration.displayName}</p>
                    <p className="mt-1 break-words font-mono text-xs text-[#667085]">{integration.source}</p>
                  </div>
                  <span className="w-fit rounded-md bg-[#e8f3ef] px-2 py-1 text-xs font-semibold text-[#116466]">
                    {integrationStatusLabel(integration.status)}
                  </span>
                  <p className="break-words text-[#667085]">{formatDate(integration.lastSyncedAt)}</p>
                </div>
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
              <h2 className="text-lg font-semibold">Ключи API</h2>
              <p className="mt-1 text-sm text-[#667085]">Состояние ключей и последняя ошибка по своему API.</p>
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs font-semibold uppercase text-[#667085]">Показать</span>
          </summary>
          <div className="mt-4">
            <DataTable
              title="Ключи API"
              description="Состояние ключей помогает понять, был ли успешный импорт или свежая ошибка."
              minWidth="min-w-[980px]"
            >
              <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Название</th>
                  <th className="px-5 py-3 font-semibold">Префикс</th>
                  <th className="px-5 py-3 font-semibold">Права доступа</th>
                  <th className="px-5 py-3 font-semibold">Последнее использование</th>
                  <th className="px-5 py-3 font-semibold">Последний успех</th>
                  <th className="px-5 py-3 font-semibold">Последняя ошибка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d7dce5]">
                {apiTokens.map((apiToken) => (
                  <tr key={apiToken.id}>
                    <td className="px-5 py-4 font-medium text-[#17202a]">{apiToken.name}</td>
                    <td className="px-5 py-4 font-mono text-xs text-[#344054]">{apiToken.tokenPrefix}</td>
                    <td className="px-5 py-4 font-mono text-xs text-[#344054]">{formatScopes(apiToken.scopes)}</td>
                    <td className="px-5 py-4 text-[#344054]">{formatLastUsed(apiToken.lastUsedAt)}</td>
                    <td className="px-5 py-4 text-[#344054]">{formatOptionalDate(apiToken.lastSuccessAt)}</td>
                    <td className="px-5 py-4 text-[#344054]">
                      {apiToken.lastError ? `${formatOptionalDate(apiToken.lastErrorAt)} · ${apiToken.lastError}` : "Нет"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </details>
      </div>
    </section>
  );
}
