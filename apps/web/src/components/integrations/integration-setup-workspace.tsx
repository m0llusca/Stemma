"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { NativeHelpdeskImportTester } from "@/components/integrations/native-helpdesk-import-tester";
import { OtrsImportTester } from "@/components/integrations/otrs-import-tester";
import { OtrsSetupWizard } from "@/components/integrations/otrs-setup-wizard";
import { CodeExampleCard, DataTable, Surface } from "@/components/integrations/integration-ui";
import {
  apiTokenPlaceholder,
  buildCurlExample,
  customApiEndpoints,
  customConversationExample,
  customConversationSchemaRows,
  customMessageExample,
  customMessageSchemaRows,
  formatJsonExample,
  otrsFamilyImportExample
} from "@/lib/custom-api-docs";
import {
  nativeHelpdeskImportExamples,
  nativeHelpdeskMappingRows,
  nativeHelpdeskSources,
  type NativeHelpdeskSource
} from "@/lib/normalizers/native-helpdesk";
import { otrsFamilyApiProfiles, otrsFamilyMappingRows } from "@/lib/normalizers/otrs-family";

type SourceMode = "otrs_family" | "native_helpdesk" | "custom_api";

const sourceModeLabels: Record<SourceMode, string> = {
  otrs_family: "OTRS / Znuny / OTOBO",
  native_helpdesk: "SaaS helpdesk",
  custom_api: "Своя система"
};

const sourceModeDescriptions: Record<SourceMode, string> = {
  otrs_family: "TicketGet JSON из OTRS CE 6, Znuny или OTOBO.",
  native_helpdesk: "Native payload из Zendesk, Intercom, Freshdesk или HubSpot.",
  custom_api: "Единый API-контракт для любой внутренней системы."
};

const customConversationImportCurl = buildCurlExample("/api/conversations", "POST", customConversationExample);
const customMessageImportCurl = buildCurlExample("/api/conversations/{id}/messages", "POST", customMessageExample);
const customReviewExportCurl = buildCurlExample("/api/reviews/export", "GET");
const otrsImportCurl = buildCurlExample("/api/integrations/otrs-family/tickets", "POST", otrsFamilyImportExample);

function nativeSourceInfo(source: NativeHelpdeskSource) {
  return nativeHelpdeskSources.find((item) => item.value === source) ?? nativeHelpdeskSources[0];
}

function nativeImportCurl(source: NativeHelpdeskSource) {
  const info = nativeSourceInfo(source);

  return buildCurlExample("/api/integrations/native-helpdesks/conversations", "POST", {
    source,
    baseUrl: "https://support.example.com",
    samplingReason: `Native ${info.label} импорт: тикет/диалог и история сообщений.`,
    payload: nativeHelpdeskImportExamples[source]
  });
}

function TechnicalDetails({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="example-disclosure rounded-md border border-[#d7dce5] bg-[#fbfcfd]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#17202a]">
        <span>{title}</span>
        <ChevronDown className="example-chevron shrink-0 text-[#98a2b3]" size={16} aria-hidden="true" />
      </summary>
      <div className="border-t border-[#d7dce5] bg-white p-4">{children}</div>
    </details>
  );
}

function SourceChoiceStep({
  mode,
  nativeSource,
  onModeChange,
  onNativeSourceChange
}: {
  mode: SourceMode;
  nativeSource: NativeHelpdeskSource;
  onModeChange: (mode: SourceMode) => void;
  onNativeSourceChange: (source: NativeHelpdeskSource) => void;
}) {
  const nativeInfo = nativeSourceInfo(nativeSource);
  const summary =
    mode === "native_helpdesk"
      ? `${nativeInfo.label}: ${nativeInfo.objectName}. ${nativeInfo.endpointHint}`
      : sourceModeDescriptions[mode];

  return (
    <Surface title="Шаг 1. Выберите источник" description="Сначала выберите тип интеграции. Остальная форма подстроится под него.">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,260px)_minmax(0,1fr)]">
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Тип источника
          <select
            value={mode}
            onChange={(event) => onModeChange(event.target.value as SourceMode)}
            className="w-full min-w-0 rounded border border-[#d7dce5] bg-white px-3 py-2"
          >
            <option value="otrs_family">{sourceModeLabels.otrs_family}</option>
            <option value="native_helpdesk">{sourceModeLabels.native_helpdesk}</option>
            <option value="custom_api">{sourceModeLabels.custom_api}</option>
          </select>
        </label>

        {mode === "native_helpdesk" ? (
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Сервис
            <select
              value={nativeSource}
              onChange={(event) => onNativeSourceChange(event.target.value as NativeHelpdeskSource)}
              className="w-full min-w-0 rounded border border-[#d7dce5] bg-white px-3 py-2"
            >
              {nativeHelpdeskSources.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="grid gap-1 text-sm font-medium text-[#344054]">
            Вариант
            <div className="rounded border border-[#d7dce5] bg-[#fbfcfd] px-3 py-2 text-[#344054]">
              {mode === "otrs_family" ? "Выбирается ниже в preflight" : "Custom API"}
            </div>
          </div>
        )}

        <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] px-4 py-3 text-sm leading-5 text-[#667085]">
          {summary}
        </div>
      </div>
    </Surface>
  );
}

function OtrsFamilySetup() {
  return (
    <div className="grid gap-4">
      <OtrsSetupWizard />

      <Surface title="Тестовый импорт TicketGet" description="Вставьте готовый TicketGet JSON и отправьте диалог в очередь ручной проверки.">
        <OtrsImportTester />
      </Surface>

      <TechnicalDetails title="Технические детали OTRS-family">
        <div className="grid gap-5">
          <div className="grid items-start gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <CodeExampleCard title="Fallback endpoint native-импорта" className="self-start">
              {otrsImportCurl}
            </CodeExampleCard>
            <DataTable title="Mapping в custom API">
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
            </DataTable>
          </div>

          <div className="grid items-start gap-4 text-sm leading-5 text-[#667085] xl:grid-cols-[minmax(0,1fr)_320px]">
            <p className="min-w-0">
              OTRS CE 6, Znuny и OTOBO поддерживаются через GenericInterface TicketGet. Конкретный route нужно сверять в
              Admin -&gt; Web Services, потому что его часто меняют при настройке.
            </p>
            <div className="grid content-start gap-2 sm:grid-cols-3 xl:grid-cols-1">
              {otrsFamilyApiProfiles.map((profile) => (
                <a
                  key={profile.source}
                  href={profile.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-[#d7dce5] bg-white px-3 py-2 text-xs font-semibold text-[#0b4f52] hover:bg-[#eef4f4]"
                >
                  {profile.shortLabel}
                </a>
              ))}
            </div>
          </div>
        </div>
      </TechnicalDetails>
    </div>
  );
}

function NativeSaasSetup({ source }: { source: NativeHelpdeskSource }) {
  const info = nativeSourceInfo(source);

  return (
    <div className="grid gap-4">
      <Surface title={`${info.label}: payload и preview`} description={`${info.objectName}. ${info.endpointHint}`}>
        <NativeHelpdeskImportTester key={source} initialSource={source} />
      </Surface>

      <TechnicalDetails title="Mapping и endpoint native-адаптера">
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <DataTable
            title="Mapping в custom API"
            description="Как native-поля превращаются в единый формат ручной проверки."
          >
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
          </DataTable>
          <CodeExampleCard
            title="Endpoint native-импорта"
            description="Один endpoint принимает разные native payload и применяет выбранный адаптер."
            className="self-start"
          >
            {nativeImportCurl(source)}
          </CodeExampleCard>
        </div>
      </TechnicalDetails>
    </div>
  );
}

function CustomApiSetup({
  apiTokenCount,
  apiHealth
}: {
  apiTokenCount: number;
  apiHealth: {
    label: string;
    className: string;
  };
}) {
  return (
    <div className="grid gap-4">
      <Surface title="Своя система через custom API" description="Для внутренних helpdesk и любых решений без готового native-адаптера.">
        <div className="grid gap-4 text-sm leading-5 text-[#667085] lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="grid gap-3">
            <p>Диалоги и сообщения отправляются в единый QC-формат, после чего попадают в очередь ручной проверки.</p>
            <code className="block rounded border border-[#d7dce5] bg-[#fbfcfd] px-3 py-2 text-xs text-[#344054]">
              Authorization: Bearer {apiTokenPlaceholder}
            </code>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={`Authorization: Bearer ${apiTokenPlaceholder}`} label="Скопировать header" />
              <Link
                href="/admin/tokens"
                className="rounded border border-[#d7dce5] bg-white px-3 py-2 text-xs font-semibold text-[#344054] hover:bg-[#eef4f4]"
              >
                Управлять токенами
              </Link>
            </div>
          </div>
          <div className="grid content-start gap-2 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
            <span className={`w-fit rounded-md px-2 py-1 text-xs font-semibold ${apiHealth.className}`}>{apiHealth.label}</span>
            <p>{apiTokenCount} токен(ов) в рабочем пространстве.</p>
          </div>
        </div>
      </Surface>

      <TechnicalDetails title="Технический контракт custom API">
        <div className="grid gap-5">
          <DataTable
            title="Endpoint-карта"
            description="Минимальный контракт для ручного QA MVP и импорта внешних диалогов."
          >
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
          </DataTable>

          <div className="grid items-start gap-4 xl:grid-cols-3">
            <CodeExampleCard title="Импорт диалога">{customConversationImportCurl}</CodeExampleCard>
            <CodeExampleCard title="Добавление сообщения">{customMessageImportCurl}</CodeExampleCard>
            <CodeExampleCard title="Экспорт проверок">{customReviewExportCurl}</CodeExampleCard>
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
            <CodeExampleCard title="Пример JSON для импорта" className="self-start">
              {formatJsonExample(customConversationExample)}
            </CodeExampleCard>
            <div className="grid gap-5">
              <DataTable title="Поля диалога" minWidth="min-w-[520px]">
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
              </DataTable>
              <DataTable title="Поля сообщения" minWidth="min-w-[520px]">
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
              </DataTable>
            </div>
          </div>
        </div>
      </TechnicalDetails>
    </div>
  );
}

export function IntegrationSetupWorkspace({
  apiTokenCount,
  apiHealth
}: {
  apiTokenCount: number;
  apiHealth: {
    label: string;
    className: string;
  };
}) {
  const [mode, setMode] = useState<SourceMode>("otrs_family");
  const [nativeSource, setNativeSource] = useState<NativeHelpdeskSource>("zendesk");

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[#d7dce5] bg-white px-5 py-4">
        <p className="text-sm font-medium text-[#667085]">Новая интеграция</p>
        <h2 className="mt-1 text-lg font-semibold text-[#17202a]">Мастер подключения источника</h2>
        <p className="mt-1 max-w-3xl text-sm leading-5 text-[#667085]">
          Один поток: выбрать источник, проверить payload, импортировать тестовый диалог.
        </p>
      </div>

      <div className="grid gap-5 p-5">
        <SourceChoiceStep
          mode={mode}
          nativeSource={nativeSource}
          onModeChange={setMode}
          onNativeSourceChange={setNativeSource}
        />

        <Surface title="Шаг 2. Настройка и тест" description={sourceModeDescriptions[mode]}>
          {mode === "otrs_family" ? <OtrsFamilySetup /> : null}
          {mode === "native_helpdesk" ? <NativeSaasSetup source={nativeSource} /> : null}
          {mode === "custom_api" ? <CustomApiSetup apiTokenCount={apiTokenCount} apiHealth={apiHealth} /> : null}
        </Surface>
      </div>
    </section>
  );
}
