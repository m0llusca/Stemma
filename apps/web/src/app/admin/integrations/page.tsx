import type { ReactNode } from "react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { NativeHelpdeskImportTester } from "@/components/integrations/native-helpdesk-import-tester";
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
  nativeHelpdeskImportExample,
  otrsFamilyImportExample
} from "@/lib/custom-api-docs";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { integrationStatusLabel } from "@/lib/labels";
import { nativeHelpdeskMappingRows, nativeHelpdeskSources } from "@/lib/normalizers/native-helpdesk";
import {
  buildOtrsFamilyTicketGetQueryParams,
  buildOtrsFamilyTicketGetRequest,
  buildOtrsFamilyTicketSearchRequest,
  otrsFamilyApiProfiles,
  otrsFamilyMappingRows,
  otrsFamilyTicketGetExample,
  otrsFamilyTicketGetUrl,
  otrsFamilyTicketSearchUrl,
  otrsFamilyUrlWithQuery,
  type OtrsFamilyApiProfile
} from "@/lib/normalizers/otrs-family";

export const dynamic = "force-dynamic";

const conversationImportCurl = buildCurlExample("/api/conversations", "POST", customConversationExample);
const messageImportCurl = buildCurlExample("/api/conversations/{id}/messages", "POST", customMessageExample);
const reviewExportCurl = buildCurlExample("/api/reviews/export", "GET");
const otrsImportCurl = buildCurlExample("/api/integrations/otrs-family/tickets", "POST", otrsFamilyImportExample);
const nativeHelpdeskImportCurl = buildCurlExample(
  "/api/integrations/native-helpdesks/conversations",
  "POST",
  nativeHelpdeskImportExample
);
const connectorCoverage = [
  {
    name: "Znuny / OTRS / OTOBO",
    phase: "Готово",
    summary: "GenericInterface TicketGet с AllArticles=1, нормализация ticket/article и идемпотентный импорт."
  },
  ...nativeHelpdeskSources.map((source) => ({
    name: source.label,
    phase: "Готово",
    summary: `${source.objectName}: ${source.endpointHint}.`
  }))
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

function buildProviderCurl({
  method,
  url,
  body
}: {
  method: "GET" | "POST";
  url: string;
  body?: unknown;
}) {
  const lines = [`curl -X ${method} "${url}"`, `  -H "Accept: application/json"`];

  if (body) {
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '${formatJsonExample(body)}'`);
  }

  return lines.join(" \\\n");
}

function providerTicketSearchCurl(profile: OtrsFamilyApiProfile) {
  const body = buildOtrsFamilyTicketSearchRequest();
  const url = otrsFamilyTicketSearchUrl(profile);

  if (profile.ticketSearchMethod === "GET") {
    return buildProviderCurl({
      method: "GET",
      url: otrsFamilyUrlWithQuery(url, body)
    });
  }

  return buildProviderCurl({
    method: "POST",
    url,
    body
  });
}

function providerTicketGetCurl(profile: OtrsFamilyApiProfile) {
  return buildProviderCurl({
    method: profile.ticketGetMethod,
    url: otrsFamilyUrlWithQuery(otrsFamilyTicketGetUrl(profile), buildOtrsFamilyTicketGetQueryParams(profile))
  });
}

function providerJsonTicketGetCurl(profile: OtrsFamilyApiProfile) {
  return buildProviderCurl({
    method: "POST",
    url: otrsFamilyTicketGetUrl(profile),
    body: buildOtrsFamilyTicketGetRequest()
  });
}

function providerWrappedTicketGetCurl(profile: OtrsFamilyApiProfile) {
  return buildProviderCurl({
    method: "POST",
    url: otrsFamilyTicketGetUrl(profile),
    body: buildOtrsFamilyTicketGetRequest({ wrapped: true })
  });
}

function qcImportCurl(profile: OtrsFamilyApiProfile) {
  return buildCurlExample("/api/integrations/otrs-family/tickets", "POST", {
    source: profile.source,
    baseUrl: profile.exampleBaseUrl,
    samplingReason: `Native ${profile.shortLabel} импорт: очередь Refunds и статьи тикета.`,
    ticketGet: otrsFamilyTicketGetExample
  });
}

function SectionHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="min-w-0">
      {eyebrow ? <p className="text-xs font-semibold uppercase text-[#667085]">{eyebrow}</p> : null}
      <h3 className="mt-1 text-sm font-semibold text-[#17202a]">{title}</h3>
      {description ? <p className="mt-1 max-w-3xl text-sm leading-5 text-[#667085]">{description}</p> : null}
    </div>
  );
}

function IntegrationBlock({
  eyebrow,
  title,
  description,
  children,
  className = ""
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-t border-[#d7dce5] p-5 ${className}`}>
      <div className="mb-4">
        <SectionHeader eyebrow={eyebrow} title={title} description={description} />
      </div>
      {children}
    </section>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#d7dce5] bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase text-[#667085]">{label}</p>
      <p className="mt-1 break-words font-mono text-xs text-[#344054]">{value}</p>
    </div>
  );
}

function CodeBlock({ children, maxHeight = "max-h-[320px]" }: { children: string; maxHeight?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <div className="flex justify-end">
        <CopyButton value={children} />
      </div>
      <pre className={`${maxHeight} overflow-auto rounded-md bg-[#17202a] p-4 text-xs leading-5 text-white`}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

function ExampleDisclosure({
  title,
  children,
  open = false
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="example-disclosure overflow-hidden rounded-md border border-[#d7dce5] bg-white" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-[#fbfcfd] px-3 py-2 text-xs font-semibold uppercase text-[#667085]">
        <span className="min-w-0">{title}</span>
        <ChevronDown className="example-chevron shrink-0 text-[#98a2b3]" size={16} aria-hidden="true" />
      </summary>
      <div className="border-t border-[#d7dce5] p-3">{children}</div>
    </details>
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
        action: {
          in: ["integration.otrs_family_imported", "integration.native_helpdesk_imported"]
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
  const hasRecentOtrsImport = recentImportLogs.some((log) => log.action === "integration.otrs_family_imported");
  const hasRecentNativeImport = recentImportLogs.some((log) => log.action === "integration.native_helpdesk_imported");
  const apiHealth = customApiHealth(apiTokens);
  const otrsHealth = plannedHealth(hasRecentOtrsImport);
  const nativeHealth = plannedHealth(hasRecentNativeImport);

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
          <div className="overflow-hidden rounded-md border border-[#d7dce5] bg-white">
            <div className="border-b border-[#d7dce5] bg-[#fbfcfd] px-4 py-3">
              <SectionHeader title="Endpoint-карта" description="Минимальный контракт для ручного QA MVP и импорта внешних диалогов." />
            </div>
            <div className="scroll-area">
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
          </div>

          <aside className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4">
            <SectionHeader title="Токены вынесены отдельно" description="Здесь только примеры вызовов. Создание и диагностика токенов живут на отдельном экране." />
            <p className="mt-3 text-sm leading-5 text-[#667085]">
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
          </aside>
        </div>

        <IntegrationBlock
          eyebrow="Примеры"
          title="Быстрые API-вызовы"
          description="Три базовых сценария: создать диалог, добавить сообщение и выгрузить завершенные проверки."
        >
          <div className="grid gap-4 xl:grid-cols-3">
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
        </IntegrationBlock>

        <IntegrationBlock
          eyebrow="Схема"
          title="JSON и поля custom API"
          description="Контракт нормализован под QC-очередь: диалог, сообщения и служебные признаки выборки."
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
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
        </IntegrationBlock>

        <IntegrationBlock
          eyebrow="Диагностика"
          title="Последние API-токены"
          description="Состояние dev-токенов помогает понять, был ли успешный импорт или свежая ошибка."
        >
          <div className="scroll-area rounded-md border border-[#d7dce5]">
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
        </IntegrationBlock>
      </IntegrationDisclosure>

      <IntegrationDisclosure
        title="OTRS-family импорт"
        description="Mapping-слой для OTRS Community Edition 6, Znuny и OTOBO: тикет становится диалогом, статьи становятся сообщениями."
        meta={`${otrsFamilyApiProfiles.length} API-профиля`}
        health={otrsHealth}
      >
        <div className="p-5">
          <OtrsSetupWizard />
        </div>

        <IntegrationBlock
          eyebrow="Профили"
          title="API-профили OTRS-family"
          description="Разводим route mapping по системам, чтобы было понятно, где canonical GET, а где кастомная настройка GenericInterface."
        >
          <div className="grid items-start gap-3 xl:grid-cols-3">
            {otrsFamilyApiProfiles.map((profile) => (
              <article key={profile.source} className="self-start rounded-md border border-[#d7dce5] bg-white p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h4 className="font-semibold text-[#17202a]">{profile.label}</h4>
                  <span className="shrink-0 rounded-md bg-[#eef4f4] px-2 py-1 text-xs font-semibold text-[#0b4f52]">
                    {profile.source}
                  </span>
                </div>
                <div className="grid gap-2 text-sm">
                  <InlineStat label="Base path" value={profile.basePath} />
                  <InlineStat label="Web Service" value={profile.webService} />
                  <InlineStat label="TicketGet route" value={`${profile.ticketGetMethod} ${profile.ticketGetPath}`} />
                  <InlineStat label="TicketSearch route" value={`${profile.ticketSearchMethod} ${profile.ticketSearchPath}`} />
                  <div className="rounded-md border border-[#d7dce5] bg-white px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-[#667085]">Auth</p>
                    <p className="mt-1 text-sm text-[#344054]">{profile.auth}</p>
                  </div>
                  <InlineStat label="Agent URL" value={profile.ticketZoomPath} />
                </div>
                <p className="mt-3 text-sm leading-5 text-[#667085]">{profile.note}</p>
                <a
                  href={profile.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm font-semibold text-[#0b4f52] hover:underline"
                >
                  Документация API
                </a>
              </article>
            ))}
          </div>
        </IntegrationBlock>

        <IntegrationBlock
          eyebrow="API-примеры"
          title="Готовые вызовы по каждому профилю"
          description="Примеры свернуты внутри профиля, чтобы страница не превращалась в длинную стену curl-команд."
        >
          <div className="grid items-start gap-4 xl:grid-cols-3">
            {otrsFamilyApiProfiles.map((profile) => (
              <article key={`${profile.source}:examples`} className="self-start rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[#17202a]">{profile.shortLabel}: API-примеры</h3>
                  <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-[#0b4f52]">{profile.source}</span>
                </div>
                <div className="grid gap-3">
                  <ExampleDisclosure title="TicketSearch в helpdesk" open={profile.source === "znuny"}>
                    <CodeBlock>{providerTicketSearchCurl(profile)}</CodeBlock>
                  </ExampleDisclosure>
                  <ExampleDisclosure title="TicketGet: канонический GET" open={profile.source === "znuny"}>
                    <CodeBlock>{providerTicketGetCurl(profile)}</CodeBlock>
                  </ExampleDisclosure>
                  <ExampleDisclosure title="TicketGet: JSON fallback">
                    <CodeBlock>{providerJsonTicketGetCurl(profile)}</CodeBlock>
                  </ExampleDisclosure>
                  <ExampleDisclosure title="TicketGet: wrapped fallback">
                    <CodeBlock>{providerWrappedTicketGetCurl(profile)}</CodeBlock>
                  </ExampleDisclosure>
                  <ExampleDisclosure title="Импорт TicketGet в QC">
                    <CodeBlock>{qcImportCurl(profile)}</CodeBlock>
                  </ExampleDisclosure>
                </div>
              </article>
            ))}
          </div>
        </IntegrationBlock>

        <IntegrationBlock
          eyebrow="Импорт"
          title="Fallback endpoint и тестовый импорт"
          description="Этот блок проверяет готовый TicketGet JSON и отправляет нормализованные диалоги в очередь ручной проверки."
        >
          <div className="grid items-start gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className="grid content-start gap-2">
              <h3 className="text-sm font-semibold text-[#17202a]">Fallback endpoint native-импорта</h3>
              <CodeBlock>{otrsImportCurl}</CodeBlock>
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
        </IntegrationBlock>
      </IntegrationDisclosure>

      <IntegrationDisclosure
        title="Native SaaS импорт"
        description="Готовые mapping-адаптеры для Zendesk, Intercom, Freshdesk и HubSpot Service Hub: native payload превращается в QA-диалог."
        meta={`${nativeHelpdeskSources.length} коннектора`}
        health={nativeHealth}
      >
        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid gap-5">
            <div className="overflow-hidden rounded-md border border-[#d7dce5] bg-white">
              <div className="border-b border-[#d7dce5] bg-[#fbfcfd] px-4 py-3">
                <SectionHeader title="Поддерживаемые источники" description="Готовые native-shape адаптеры без ручного маппинга в JSON-схему QC." />
              </div>
              <div className="scroll-area">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Источник</th>
                      <th className="px-4 py-3 font-semibold">Объект</th>
                      <th className="px-4 py-3 font-semibold">API/export shape</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d7dce5]">
                    {nativeHelpdeskSources.map((source) => (
                      <tr key={source.value}>
                        <td className="px-4 py-3 font-medium text-[#17202a]">{source.label}</td>
                        <td className="px-4 py-3 text-[#344054]">{source.objectName}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[#344054]">{source.endpointHint}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-hidden rounded-md border border-[#d7dce5] bg-white">
              <div className="border-b border-[#d7dce5] bg-[#fbfcfd] px-4 py-3">
                <SectionHeader title="Mapping в custom API" description="Как native-поля превращаются в единый формат ручной проверки." />
              </div>
              <div className="scroll-area">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Native поле</th>
                      <th className="px-4 py-3 font-semibold">Поле QC</th>
                      <th className="px-4 py-3 font-semibold">Правило</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d7dce5]">
                    {nativeHelpdeskMappingRows.map((row) => (
                      <tr key={`${row.source}:${row.target}`}>
                        <td className="px-4 py-3 font-mono text-xs">{row.source}</td>
                        <td className="px-4 py-3 font-mono text-xs">{row.target}</td>
                        <td className="px-4 py-3 text-[#344054]">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside className="grid content-start gap-2 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4">
            <SectionHeader title="Endpoint native-импорта" description="Один endpoint принимает разные native payload и применяет выбранный адаптер." />
            <CodeBlock>{nativeHelpdeskImportCurl}</CodeBlock>
          </aside>
        </div>

        <IntegrationBlock
          eyebrow="Проверка"
          title="Тестовый импорт native helpdesk"
          description="Можно быстро переключить источник, посмотреть preview и отправить диалог в очередь."
        >
          <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4">
            <p className="mb-3 text-sm font-semibold text-[#17202a]">Payload и preview перед импортом</p>
            <NativeHelpdeskImportTester />
          </div>
        </IntegrationBlock>
      </IntegrationDisclosure>

      <IntegrationDisclosure
        title="Последние импорты"
        description="Успешные native импорты с количеством диалогов, ошибками и быстрым переходом в очередь."
        meta={`${recentImportLogs.length} событий`}
        health={hasRecentOtrsImport ? { label: "Есть данные", className: badgeClass("ok") } : { label: "Пока пусто", className: badgeClass("neutral") }}
      >
        {recentImportLogs.length > 0 ? (
          <div className="p-5">
            <div className="scroll-area rounded-md border border-[#d7dce5]">
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
                <tbody className="divide-y divide-[#d7dce5] bg-white">
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
          </div>
        ) : (
          <div className="p-5">
            <div className="rounded-md border border-dashed border-[#d7dce5] bg-[#fbfcfd] p-5 text-sm text-[#667085]">
              Импорты появятся здесь после тестового или API-импорта native-коннекторов.
            </div>
          </div>
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
          <div className="p-5">
            <div className="scroll-area rounded-md border border-[#d7dce5]">
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
          </div>
        </IntegrationDisclosure>

        <IntegrationDisclosure
          title="Покрытие интеграций"
          description="Список native-адаптеров, доступных для ручного QA MVP через API или тестовый импорт."
          meta={`${connectorCoverage.length} типов`}
          health={{ label: "Готово", className: badgeClass("ok") }}
          className="mb-0"
        >
          <div className="grid gap-3 p-5">
            {connectorCoverage.map((item) => (
              <article key={item.name} className="rounded-md border border-[#d7dce5] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-[#17202a]">{item.name}</h3>
                  <span className="shrink-0 rounded-md bg-[#e8f3ef] px-2 py-1 text-xs font-semibold text-[#116466]">
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
