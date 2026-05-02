import type { ReactNode } from "react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { OtrsImportTester } from "@/components/integrations/otrs-import-tester";
import { OtrsSetupWizard } from "@/components/integrations/otrs-setup-wizard";
import { ChevronDown } from "lucide-react";
import {
  buildCurlExample,
  customApiEndpoints,
  customConversationExample,
  customConversationSchemaRows,
  customMessageExample,
  customMessageSchemaRows,
  apiTokenPlaceholder,
  formatJsonExample,
  otrsFamilyImportExample
} from "@/lib/custom-api-docs";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { integrationStatusLabel } from "@/lib/labels";
import { otrsFamilyMappingRows } from "@/lib/normalizers/otrs-family";

export const dynamic = "force-dynamic";

const conversationImportCurl = buildCurlExample("/api/conversations", "POST", customConversationExample);
const messageImportCurl = buildCurlExample("/api/conversations/{id}/messages", "POST", customMessageExample);
const reviewExportCurl = buildCurlExample("/api/reviews/export", "GET");
const otrsImportCurl = buildCurlExample("/api/integrations/otrs-family/tickets", "POST", otrsFamilyImportExample);
const otrsTicketGetRequest = formatJsonExample({
  TicketGet: {
    UserLogin: "agent_login",
    Password: "agent_password",
    TicketID: "42",
    Extended: 1,
    AllArticles: 1,
    ArticleOrder: "ASC",
    DynamicFields: 1,
    Attachments: 0
  }
});

const roadmap = [
  {
    name: "Znuny / OTRS / OTOBO",
    phase: "Этап 2 · первый native track",
    summary: "GenericInterface TicketGet с AllArticles=1, нормализация ticket/article и идемпотентный импорт."
  },
  {
    name: "Zendesk",
    phase: "Этап 2",
    summary: "Импорт тикетов, синхронизация диалогов и подготовка выборки для проверок."
  },
  {
    name: "Intercom / Freshdesk / HubSpot",
    phase: "Этап 3",
    summary: "Дополнительные SaaS-каналы после базового слоя коннекторов."
  }
];

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

function plannedHealth(hasActiveImport: boolean) {
  return hasActiveImport
    ? { label: "Импорт был", className: badgeClass("ok") }
    : { label: "Готов к тесту", className: badgeClass("neutral") };
}

function parseImportMetadata(value: string) {
  try {
    const parsed = JSON.parse(value) as {
      source?: string;
      count?: number;
      externalIds?: string[];
      baseUrl?: string;
    };

    return {
      source: parsed.source ?? "otrs_family",
      count: typeof parsed.count === "number" ? parsed.count : 0,
      externalIds: Array.isArray(parsed.externalIds) ? parsed.externalIds : [],
      baseUrl: parsed.baseUrl
    };
  } catch {
    return {
      source: "otrs_family",
      count: 0,
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

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="grid gap-2">
      <div className="flex justify-end">
        <CopyButton value={children} />
      </div>
      <pre className="overflow-x-auto rounded-md bg-[#17202a] p-4 text-xs leading-5 text-white">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function IntegrationDisclosure({
  title,
  description,
  meta,
  health,
  children,
  className = "mb-6"
}: {
  title: string;
  description: string;
  meta: string;
  health?: {
    label: string;
    className: string;
  };
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`panel disclosure-panel overflow-hidden ${className}`}>
      <summary className="disclosure-summary flex cursor-pointer list-none flex-wrap items-start justify-between gap-4 px-5 py-4 sm:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-[#667085]">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {health ? <span className={`rounded-md px-2 py-1 text-xs font-semibold ${health.className}`}>{health.label}</span> : null}
          <span className="rounded-md bg-[#eef4f4] px-2 py-1 text-xs font-semibold text-[#0b4f52]">{meta}</span>
          <ChevronDown className="disclosure-chevron text-[#667085]" size={18} aria-hidden="true" />
        </div>
      </summary>
      <div className="border-t border-[#d7dce5]">{children}</div>
    </details>
  );
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
        action: "integration.otrs_family_imported",
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
  const hasRecentOtrsImport = recentImportLogs.length > 0;
  const apiHealth = customApiHealth(apiTokens);
  const otrsHealth = plannedHealth(hasRecentOtrsImport);

  return (
    <section className="page-shell">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#667085]">Администрирование</p>
        <h1 className="mt-1 text-2xl font-semibold">Интеграции</h1>
      </div>

      <IntegrationDisclosure
        title="Кастомный API"
        description="Endpoint-справка, dev-токен, curl-примеры, JSON-схемы и диагностика API-токена."
        meta={`${customApiEndpoints.length} эндпоинта`}
        health={apiHealth}
      >
        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Метод</th>
                  <th className="px-4 py-3 font-semibold">Endpoint</th>
                  <th className="px-4 py-3 font-semibold">Scope</th>
                  <th className="px-4 py-3 font-semibold">Назначение</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d7dce5]">
                {customApiEndpoints.map((endpoint) => (
                  <tr key={`${endpoint.method}:${endpoint.path}`}>
                    <td className="px-4 py-3 font-medium">{endpoint.method}</td>
                    <td className="px-4 py-3 font-mono text-xs">{endpoint.path}</td>
                    <td className="px-4 py-3 font-mono text-xs">{endpoint.scope}</td>
                    <td className="px-4 py-3 text-[#344054]">{endpoint.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-md border border-[#d7dce5] bg-[#f7f8fb] p-4">
            <p className="text-sm font-semibold text-[#17202a]">Токены вынесены отдельно</p>
            <p className="mt-2 text-sm leading-5 text-[#667085]">
              В примерах используется {apiTokenPlaceholder}; реальные значения, scopes и диагностика доступны на экране
              управления токенами.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyButton value={`Authorization: Bearer ${apiTokenPlaceholder}`} label="Скопировать header" />
              <Link
                href="/admin/tokens"
                className="rounded border border-[#d7dce5] bg-white px-3 py-2 text-xs font-semibold text-[#344054] hover:bg-[#eef4f4]"
              >
                Управлять токенами
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-5 border-t border-[#d7dce5] p-5 xl:grid-cols-3">
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold text-[#17202a]">Импорт диалога</h3>
            <CodeBlock>{conversationImportCurl}</CodeBlock>
          </div>
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold text-[#17202a]">Добавление сообщения</h3>
            <CodeBlock>{messageImportCurl}</CodeBlock>
          </div>
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold text-[#17202a]">Экспорт проверок</h3>
            <CodeBlock>{reviewExportCurl}</CodeBlock>
          </div>
        </div>

        <div className="grid gap-5 border-t border-[#d7dce5] p-5 xl:grid-cols-[minmax(0,1fr)_520px]">
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold text-[#17202a]">Пример JSON для импорта</h3>
            <CodeBlock>{formatJsonExample(customConversationExample)}</CodeBlock>
          </div>
          <div className="grid gap-5">
            <div className="overflow-x-auto">
              <h3 className="mb-2 text-sm font-semibold text-[#17202a]">Поля диалога</h3>
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Поле</th>
                    <th className="px-3 py-2 font-semibold">Обяз.</th>
                    <th className="px-3 py-2 font-semibold">Тип</th>
                    <th className="px-3 py-2 font-semibold">Примечание</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d7dce5]">
                  {customConversationSchemaRows.map((row) => (
                    <tr key={row.field}>
                      <td className="px-3 py-2 font-mono text-xs">{row.field}</td>
                      <td className="px-3 py-2">{row.required}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.type}</td>
                      <td className="px-3 py-2 text-[#344054]">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <h3 className="mb-2 text-sm font-semibold text-[#17202a]">Поля сообщения</h3>
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Поле</th>
                    <th className="px-3 py-2 font-semibold">Обяз.</th>
                    <th className="px-3 py-2 font-semibold">Тип</th>
                    <th className="px-3 py-2 font-semibold">Примечание</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d7dce5]">
                  {customMessageSchemaRows.map((row) => (
                    <tr key={row.field}>
                      <td className="px-3 py-2 font-mono text-xs">{row.field}</td>
                      <td className="px-3 py-2">{row.required}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.type}</td>
                      <td className="px-3 py-2 text-[#344054]">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="scroll-area border-t border-[#d7dce5]">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
              <tr>
                <th className="px-5 py-3 font-semibold">Название</th>
                <th className="px-5 py-3 font-semibold">Префикс</th>
                <th className="px-5 py-3 font-semibold">Scopes</th>
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
          </table>
        </div>
      </IntegrationDisclosure>

      <IntegrationDisclosure
        title="OTRS-family импорт"
        description="Mapping-слой для OTRS Community Edition 6, Znuny и OTOBO: тикет становится диалогом, статьи становятся сообщениями."
        meta="TicketGet"
        health={otrsHealth}
      >
        <div className="p-5">
          <OtrsSetupWizard />
        </div>
        <div className="grid gap-5 p-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="grid gap-5">
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold text-[#17202a]">Рекомендуемый TicketGet</h3>
              <CodeBlock>{otrsTicketGetRequest}</CodeBlock>
            </div>
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold text-[#17202a]">Endpoint native-импорта</h3>
              <CodeBlock>{otrsImportCurl}</CodeBlock>
            </div>
          </div>
          <div className="grid gap-5">
            <div className="overflow-x-auto">
              <h3 className="mb-2 text-sm font-semibold text-[#17202a]">Mapping в custom API</h3>
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">OTRS/Znuny/OTOBO</th>
                    <th className="px-4 py-3 font-semibold">Поле QC</th>
                    <th className="px-4 py-3 font-semibold">Правило</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d7dce5]">
                  {otrsFamilyMappingRows.map((row) => (
                    <tr key={`${row.source}:${row.target}`}>
                      <td className="px-4 py-3 font-mono text-xs">{row.source}</td>
                      <td className="px-4 py-3 font-mono text-xs">{row.target}</td>
                      <td className="px-4 py-3 text-[#344054]">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-md border border-[#d7dce5] bg-[#f7f8fb] p-4">
              <h3 className="mb-3 text-sm font-semibold text-[#17202a]">Тестовый импорт TicketGet</h3>
              <OtrsImportTester />
            </div>
          </div>
        </div>
      </IntegrationDisclosure>

      <IntegrationDisclosure
        title="Последние импорты"
        description="Успешные OTRS-family импорты с количеством тикетов, ошибками и быстрым переходом в очередь."
        meta={`${recentImportLogs.length} событий`}
        health={hasRecentOtrsImport ? { label: "Есть данные", className: badgeClass("ok") } : { label: "Пока пусто", className: badgeClass("neutral") }}
      >
        {recentImportLogs.length > 0 ? (
          <div className="scroll-area">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Дата</th>
                  <th className="px-5 py-3 font-semibold">Источник</th>
                  <th className="px-5 py-3 font-semibold">Тикеты</th>
                  <th className="px-5 py-3 font-semibold">Ошибки</th>
                  <th className="px-5 py-3 font-semibold">Запустил</th>
                  <th className="px-5 py-3 font-semibold">Очередь</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d7dce5]">
                {recentImportLogs.map((log) => {
                  const metadata = parseImportMetadata(log.metadata);

                  return (
                    <tr key={log.id}>
                      <td className="px-5 py-4 text-[#344054]">{formatDate(log.createdAt)}</td>
                      <td className="px-5 py-4 font-mono text-xs text-[#344054]">{metadata.source}</td>
                      <td className="px-5 py-4 font-semibold text-[#17202a]">{metadata.count}</td>
                      <td className="px-5 py-4 text-[#344054]">0</td>
                      <td className="px-5 py-4 text-[#344054]">{log.actor.name}</td>
                      <td className="px-5 py-4">
                        <Link href={queueHref(metadata.source, metadata.externalIds)} className="font-semibold text-[#0b4f52] hover:underline">
                          Открыть
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5 text-sm text-[#667085]">Импорты появятся здесь после тестового или API-импорта OTRS-family.</div>
        )}
      </IntegrationDisclosure>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <IntegrationDisclosure
          title="Демо-записи"
          description="Подключенные и запланированные источники в текущем рабочем пространстве."
          meta={`${integrations.length} записи`}
          health={{ label: "Запланировано", className: badgeClass("neutral") }}
          className="mb-0"
        >
          <div className="scroll-area">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Название</th>
                  <th className="px-5 py-3 font-semibold">Источник</th>
                  <th className="px-5 py-3 font-semibold">Статус</th>
                  <th className="px-5 py-3 font-semibold">Последняя синхронизация</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d7dce5]">
                {integrations.map((integration) => (
                  <tr key={integration.id}>
                    <td className="px-5 py-4 font-medium text-[#17202a]">{integration.displayName}</td>
                    <td className="px-5 py-4 text-[#344054]">{integration.source}</td>
                    <td className="px-5 py-4 text-[#344054]">{integrationStatusLabel(integration.status)}</td>
                    <td className="px-5 py-4 text-[#344054]">{formatDate(integration.lastSyncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </IntegrationDisclosure>

        <IntegrationDisclosure
          title="План интеграций"
          description="Очередность native-коннекторов после универсального API и OTRS-family трека."
          meta="Этапы 2-3"
          health={{ label: "Roadmap", className: badgeClass("neutral") }}
          className="mb-0"
        >
          <div className="grid gap-3 p-5">
            {roadmap.map((item) => (
              <article key={item.name} className="rounded-md border border-[#d7dce5] p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-[#17202a]">{item.name}</h3>
                  <span className="shrink-0 rounded-md bg-[#eef4f4] px-2 py-1 text-xs font-semibold text-[#0b4f52]">
                    {item.phase}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-5 text-[#667085]">{item.summary}</p>
              </article>
            ))}
          </div>
        </IntegrationDisclosure>
      </div>
    </section>
  );
}
