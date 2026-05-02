"use client";

import Link from "next/link";
import { ChevronDown, Code2, PlugZap, Settings2, TicketCheck, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
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

type SourceId = "otrs_family" | "custom_api" | NativeHelpdeskSource;
type SourceOption = {
  id: SourceId;
  title: string;
  kind: string;
  description: string;
  detail: string;
  Icon: LucideIcon;
};

const sourceOptions: SourceOption[] = [
  {
    id: "otrs_family",
    title: "OTRS / Znuny / OTOBO",
    kind: "OTRS-family",
    description: "TicketGet, статьи тикета и GenericInterface routes.",
    detail: "Для OTRS CE 6, Znuny LTS и OTOBO.",
    Icon: TicketCheck
  },
  ...nativeHelpdeskSources.map((source) => ({
    id: source.value,
    title: source.label,
    kind: "Native SaaS",
    description: source.objectName,
    detail: source.endpointHint,
    Icon: PlugZap
  })),
  {
    id: "custom_api",
    title: "Своя система",
    kind: "Custom API",
    description: "Универсальный контракт для любого внутреннего helpdesk.",
    detail: "POST conversations/messages и экспорт завершенных проверок.",
    Icon: Code2
  }
];

const customConversationImportCurl = buildCurlExample("/api/conversations", "POST", customConversationExample);
const customMessageImportCurl = buildCurlExample("/api/conversations/{id}/messages", "POST", customMessageExample);
const customReviewExportCurl = buildCurlExample("/api/reviews/export", "GET");
const otrsImportCurl = buildCurlExample("/api/integrations/otrs-family/tickets", "POST", otrsFamilyImportExample);

function isNativeSource(id: SourceId): id is NativeHelpdeskSource {
  return nativeHelpdeskSources.some((source) => source.value === id);
}

function nativeSourceInfo(source: NativeHelpdeskSource) {
  return nativeHelpdeskSources.find((item) => item.value === source) ?? nativeHelpdeskSources[0];
}

function sourceOptionById(id: SourceId) {
  return sourceOptions.find((option) => option.id === id) ?? sourceOptions[0];
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

function SourcePicker({
  selectedId,
  onSelect
}: {
  selectedId: SourceId;
  onSelect: (sourceId: SourceId) => void;
}) {
  return (
    <div className="grid gap-2">
      {sourceOptions.map((option) => {
        const isSelected = selectedId === option.id;
        const Icon = option.Icon;

        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(option.id)}
            className={`grid w-full min-w-0 grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-md border p-3 text-left transition ${
              isSelected
                ? "border-[#116466] bg-[#e8f3ef] shadow-sm"
                : "border-[#d7dce5] bg-white hover:border-[#98a2b3] hover:bg-[#fbfcfd]"
            }`}
          >
            <span
              className={`grid size-9 place-items-center rounded border ${
                isSelected ? "border-[#116466] bg-white text-[#116466]" : "border-[#d7dce5] bg-[#fbfcfd] text-[#667085]"
              }`}
            >
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-semibold text-[#17202a]">{option.title}</span>
                <span className="rounded bg-white/80 px-2 py-1 text-[11px] font-semibold uppercase text-[#0b4f52]">
                  {option.kind}
                </span>
              </span>
              <span className="mt-1 block text-sm leading-5 text-[#667085]">{option.description}</span>
              <span className="mt-1 block break-words font-mono text-[11px] leading-4 text-[#667085]">{option.detail}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WorkflowStrip() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {["Источник", "Параметры", "Preview", "Импорт"].map((step, index) => (
        <div key={step} className="flex min-w-0 items-center gap-2 rounded-md border border-[#d7dce5] bg-[#fbfcfd] px-3 py-2">
          <span className="grid size-6 place-items-center rounded bg-[#116466] text-xs font-semibold text-white">{index + 1}</span>
          <span className="min-w-0 text-sm font-semibold text-[#344054]">{step}</span>
        </div>
      ))}
    </div>
  );
}

function OtrsFamilySetup() {
  return (
    <div className="grid gap-5">
      <OtrsSetupWizard />

      <div className="grid items-start gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <CodeExampleCard title="Fallback endpoint native-импорта" className="self-start">
          {otrsImportCurl}
        </CodeExampleCard>
        <div className="grid gap-5">
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
          <Surface title="Тестовый импорт TicketGet" className="bg-[#f7f8fb]">
            <OtrsImportTester />
          </Surface>
        </div>
      </div>

      <TechnicalDetails title="Техническая справка по OTRS-family">
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
      </TechnicalDetails>
    </div>
  );
}

function NativeSaasSetup({ source }: { source: NativeHelpdeskSource }) {
  const info = nativeSourceInfo(source);

  return (
    <div className="grid gap-5">
      <Surface title={`${info.label}: payload и preview`} description={`${info.objectName}. ${info.endpointHint}`} className="bg-[#fbfcfd]">
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
    <div className="grid gap-5">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Surface title="Своя система через custom API" description="Для внутренних helpdesk и любых решений без готового native-адаптера.">
          <div className="grid gap-3 text-sm leading-5 text-[#667085]">
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
        </Surface>
        <Surface title="Dev-токены" description={`${apiTokenCount} токен(ов) в рабочем пространстве.`} className="self-start bg-[#fbfcfd]">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-1 text-xs font-semibold ${apiHealth.className}`}>{apiHealth.label}</span>
            <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-[#0b4f52]">
              {customApiEndpoints.length} endpoint
            </span>
          </div>
        </Surface>
      </div>

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
  const [selectedId, setSelectedId] = useState<SourceId>("otrs_family");
  const selectedOption = sourceOptionById(selectedId);
  const Icon = selectedOption.Icon;

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#d7dce5] bg-white px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#667085]">Новая интеграция</p>
          <h2 className="mt-1 text-lg font-semibold text-[#17202a]">Единый мастер подключения источника</h2>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-[#667085]">
            Выберите систему слева, а параметры, preview и тестовый импорт появятся в одном рабочем пространстве.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-[#e8f3ef] px-2 py-1 text-xs font-semibold text-[#116466]">1 мастер</span>
          <span className="rounded-md bg-[#eef4f4] px-2 py-1 text-xs font-semibold text-[#0b4f52]">
            {sourceOptions.length} вариантов
          </span>
        </div>
      </div>

      <div className="grid xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-b border-[#d7dce5] bg-[#fbfcfd] p-4 xl:border-b-0 xl:border-r">
          <SourcePicker selectedId={selectedId} onSelect={setSelectedId} />
        </aside>

        <div className="grid gap-5 p-5">
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md border border-[#d7dce5] bg-[#fbfcfd] text-[#116466]">
                <Icon size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-[#667085]">{selectedOption.kind}</p>
                <h3 className="mt-1 text-base font-semibold text-[#17202a]">{selectedOption.title}</h3>
                <p className="mt-1 text-sm leading-5 text-[#667085]">{selectedOption.description}</p>
              </div>
            </div>
            <div className="grid content-start gap-2 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#17202a]">
                <Workflow size={16} aria-hidden="true" />
                Сценарий
              </div>
              <WorkflowStrip />
            </div>
          </div>

          {selectedId === "otrs_family" ? <OtrsFamilySetup /> : null}
          {isNativeSource(selectedId) ? <NativeSaasSetup source={selectedId} /> : null}
          {selectedId === "custom_api" ? <CustomApiSetup apiTokenCount={apiTokenCount} apiHealth={apiHealth} /> : null}

          <div className="grid gap-3 rounded-md border border-dashed border-[#d7dce5] bg-[#fbfcfd] p-4 text-sm leading-5 text-[#667085] sm:grid-cols-[32px_minmax(0,1fr)]">
            <span className="grid size-8 place-items-center rounded bg-white text-[#116466]">
              <Settings2 size={16} aria-hidden="true" />
            </span>
            <p className="min-w-0">
              После успешного тестового импорта источник уже можно использовать для ручной QA-очереди. Следующий слой для
              prod-версии: сохраняем подключение как карточку источника и запускаем импорт по расписанию.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
