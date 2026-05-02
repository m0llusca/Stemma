"use client";

import Link from "next/link";
import { CheckCircle2, ChevronDown, ShieldCheck } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
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
import {
  buildOtrsFamilyTicketGetQueryParams,
  buildOtrsFamilyTicketGetRequest,
  otrsFamilyApiProfiles,
  otrsFamilyMappingRows,
  otrsFamilyProfileForSource,
  otrsFamilyRequestShapeNotes,
  otrsFamilySourceOptions,
  otrsFamilyTicketGetUrl,
  otrsFamilyUrlWithQuery,
  type OtrsFamilySource
} from "@/lib/normalizers/otrs-family";

type SourceMode = "otrs_family" | "native_helpdesk" | "custom_api";
type WizardStep = "source" | "access" | "limits" | "preview" | "done";

const fieldClass = "w-full min-w-0 rounded border border-[#d7dce5] bg-white px-3 py-2";

const sourceModeLabels: Record<SourceMode, string> = {
  otrs_family: "OTRS / Znuny / OTOBO",
  native_helpdesk: "SaaS helpdesk",
  custom_api: "Своя система"
};

const sourceModeDescriptions: Record<SourceMode, string> = {
  otrs_family: "Подключение через GenericInterface TicketGet с безопасным preview перед запуском.",
  native_helpdesk: "Импорт тикетов и сообщений из популярных SaaS helpdesk через native-адаптеры.",
  custom_api: "Единый контракт для внутренних систем и нестандартных helpdesk."
};

const wizardSteps: Array<{ value: WizardStep; label: string; title: string }> = [
  { value: "source", label: "Источник", title: "Шаг 1. Источник" },
  { value: "access", label: "Доступ", title: "Шаг 2. Доступ" },
  { value: "limits", label: "Лимиты", title: "Шаг 3. Лимиты" },
  { value: "preview", label: "Preview", title: "Шаг 4. Preview" },
  { value: "done", label: "Готово", title: "Шаг 5. Готово" }
];

const customConversationImportCurl = buildCurlExample("/api/conversations", "POST", customConversationExample);
const customMessageImportCurl = buildCurlExample("/api/conversations/{id}/messages", "POST", customMessageExample);
const customReviewExportCurl = buildCurlExample("/api/reviews/export", "GET");
const otrsImportCurl = buildCurlExample("/api/integrations/otrs-family/tickets", "POST", otrsFamilyImportExample);

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

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

function toPositiveNumber(value: string, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
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

function StepProgress({ currentStepIndex }: { currentStepIndex: number }) {
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center gap-2" aria-hidden="true">
        {wizardSteps.map((step, index) => (
          <span
            key={step.value}
            className={`h-1.5 flex-1 rounded-full ${index <= currentStepIndex ? "bg-[#116466]" : "bg-[#d7dce5]"}`}
          />
        ))}
      </div>
      <p className="text-xs font-semibold uppercase text-[#667085]">
        Шаг {currentStepIndex + 1} из {wizardSteps.length}: {wizardSteps[currentStepIndex].label}
      </p>
    </div>
  );
}

function WizardFrame({
  currentStepIndex,
  title,
  description,
  sourceLabel,
  children,
  nextLabel = "Далее",
  nextDisabled = false,
  onBack,
  onNext
}: {
  currentStepIndex: number;
  title: string;
  description: string;
  sourceLabel: string;
  children: ReactNode;
  nextLabel?: string;
  nextDisabled?: boolean;
  onBack?: () => void;
  onNext?: () => void;
}) {
  return (
    <Surface>
      <div className="grid gap-4">
        <div className="grid gap-3 border-b border-[#d7dce5] pb-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="min-w-0">
            <StepProgress currentStepIndex={currentStepIndex} />
            <h3 className="mt-2 text-base font-semibold text-[#17202a]">{title}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-[#667085]">{description}</p>
          </div>
          <span className="w-fit rounded-md border border-[#d7dce5] bg-[#fbfcfd] px-2 py-1 text-xs font-semibold text-[#0b4f52]">
            {sourceLabel}
          </span>
        </div>

        {children}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#d7dce5] pt-4">
          <button
            type="button"
            onClick={onBack}
            disabled={!onBack}
            className="rounded border border-[#d7dce5] bg-white px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#eef4f4] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Назад
          </button>
          {onNext ? (
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled}
              className="rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52] disabled:cursor-not-allowed disabled:bg-[#98a2b3]"
            >
              {nextLabel}
            </button>
          ) : null}
        </div>
      </div>
    </Surface>
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
      ? `${nativeInfo.label}: ${nativeInfo.objectName}.`
      : sourceModeDescriptions[mode];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,260px)_minmax(0,1fr)]">
      <label className="grid gap-1 text-sm font-medium text-[#344054]">
        Тип источника
        <select value={mode} onChange={(event) => onModeChange(event.target.value as SourceMode)} className={fieldClass}>
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
            className={fieldClass}
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
            {mode === "otrs_family" ? "Платформа выбирается на следующем шаге" : "Custom API"}
          </div>
        </div>
      )}

      <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] px-4 py-3 text-sm leading-5 text-[#667085]">
        {summary}
      </div>
    </div>
  );
}

function AccessStep({
  mode,
  nativeSource,
  otrsSource,
  otrsBaseUrl,
  userLogin,
  password,
  ticketId,
  nativeBaseUrl,
  nativeToken,
  customSystemName,
  customBaseUrl,
  apiTokenCount,
  apiHealth,
  onOtrsSourceChange,
  onOtrsBaseUrlChange,
  onUserLoginChange,
  onPasswordChange,
  onTicketIdChange,
  onNativeBaseUrlChange,
  onNativeTokenChange,
  onCustomSystemNameChange,
  onCustomBaseUrlChange
}: {
  mode: SourceMode;
  nativeSource: NativeHelpdeskSource;
  otrsSource: OtrsFamilySource;
  otrsBaseUrl: string;
  userLogin: string;
  password: string;
  ticketId: string;
  nativeBaseUrl: string;
  nativeToken: string;
  customSystemName: string;
  customBaseUrl: string;
  apiTokenCount: number;
  apiHealth: {
    label: string;
    className: string;
  };
  onOtrsSourceChange: (source: OtrsFamilySource) => void;
  onOtrsBaseUrlChange: (value: string) => void;
  onUserLoginChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTicketIdChange: (value: string) => void;
  onNativeBaseUrlChange: (value: string) => void;
  onNativeTokenChange: (value: string) => void;
  onCustomSystemNameChange: (value: string) => void;
  onCustomBaseUrlChange: (value: string) => void;
}) {
  if (mode === "otrs_family") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Платформа
          <select
            value={otrsSource}
            onChange={(event) => onOtrsSourceChange(event.target.value as OtrsFamilySource)}
            className={fieldClass}
          >
            {otrsFamilySourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Base URL
          <input value={otrsBaseUrl} onChange={(event) => onOtrsBaseUrlChange(event.target.value)} className={fieldClass} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          UserLogin
          <input value={userLogin} onChange={(event) => onUserLoginChange(event.target.value)} className={fieldClass} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Password
          <input
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            type="password"
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#344054] md:col-span-2">
          TicketID для preview
          <input value={ticketId} onChange={(event) => onTicketIdChange(event.target.value)} className={fieldClass} />
        </label>
      </div>
    );
  }

  if (mode === "native_helpdesk") {
    const info = nativeSourceInfo(nativeSource);

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1 text-sm font-medium text-[#344054]">
          Выбранный сервис
          <div className="rounded border border-[#d7dce5] bg-[#fbfcfd] px-3 py-2 text-[#344054]">{info.label}</div>
        </div>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Base URL
          <input value={nativeBaseUrl} onChange={(event) => onNativeBaseUrlChange(event.target.value)} className={fieldClass} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#344054] md:col-span-2">
          API token или app secret
          <input
            value={nativeToken}
            onChange={(event) => onNativeTokenChange(event.target.value)}
            type="password"
            placeholder="Будет храниться в секретах окружения"
            className={fieldClass}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="grid gap-4">
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Название системы
          <input value={customSystemName} onChange={(event) => onCustomSystemNameChange(event.target.value)} className={fieldClass} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Base URL источника
          <input value={customBaseUrl} onChange={(event) => onCustomBaseUrlChange(event.target.value)} className={fieldClass} />
        </label>
      </div>
      <div className="grid content-start gap-3 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3 text-sm leading-5 text-[#667085]">
        <span className={`w-fit rounded-md px-2 py-1 text-xs font-semibold ${apiHealth.className}`}>{apiHealth.label}</span>
        <p>{apiTokenCount} API-токен(ов) в рабочем пространстве.</p>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={`Authorization: Bearer ${apiTokenPlaceholder}`} label="Скопировать header" />
          <Link
            href="/admin/tokens"
            className="rounded border border-[#d7dce5] bg-white px-3 py-2 text-xs font-semibold text-[#344054] hover:bg-[#eef4f4]"
          >
            Токены
          </Link>
        </div>
      </div>
    </div>
  );
}

function LimitsStep({
  dateRangeDays,
  maxTickets,
  batchSize,
  queueFilter,
  statusFilter,
  dryRun,
  deduplicate,
  onDateRangeDaysChange,
  onMaxTicketsChange,
  onBatchSizeChange,
  onQueueFilterChange,
  onStatusFilterChange,
  onDryRunChange,
  onDeduplicateChange
}: {
  dateRangeDays: string;
  maxTickets: string;
  batchSize: string;
  queueFilter: string;
  statusFilter: string;
  dryRun: boolean;
  deduplicate: boolean;
  onDateRangeDaysChange: (value: string) => void;
  onMaxTicketsChange: (value: string) => void;
  onBatchSizeChange: (value: string) => void;
  onQueueFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onDryRunChange: (value: boolean) => void;
  onDeduplicateChange: (value: boolean) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Период, дней
          <input
            value={dateRangeDays}
            onChange={(event) => onDateRangeDaysChange(event.target.value)}
            type="number"
            min="1"
            max="365"
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Максимум тикетов
          <input
            value={maxTickets}
            onChange={(event) => onMaxTicketsChange(event.target.value)}
            type="number"
            min="1"
            max="1000"
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Размер батча
          <input
            value={batchSize}
            onChange={(event) => onBatchSizeChange(event.target.value)}
            type="number"
            min="1"
            max="100"
            className={fieldClass}
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Очередь, группа или inbox
          <input value={queueFilter} onChange={(event) => onQueueFilterChange(event.target.value)} className={fieldClass} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Статусы или теги
          <input value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)} className={fieldClass} />
        </label>
      </div>

      <div className="grid gap-3 text-sm text-[#344054] md:grid-cols-2">
        <label className="flex min-w-0 items-start gap-2 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
          <input type="checkbox" checked={dryRun} onChange={(event) => onDryRunChange(event.target.checked)} />
          <span className="min-w-0">
            Сначала dry-run: проверить доступ и объем без создания записей в очереди.
          </span>
        </label>
        <label className="flex min-w-0 items-start gap-2 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
          <input type="checkbox" checked={deduplicate} onChange={(event) => onDeduplicateChange(event.target.checked)} />
          <span className="min-w-0">
            Не создавать дубликаты по паре externalSource + externalId.
          </span>
        </label>
      </div>

      <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3 text-sm leading-5 text-[#667085]">
        Автоматика не заберет весь архив сразу: каждый запуск ограничен периодом, максимумом тикетов и размером батча.
      </div>
    </div>
  );
}

function PreviewStep({
  mode,
  sourceLabel,
  baseUrl,
  queueFilter,
  statusFilter,
  dateRangeDays,
  maxTickets,
  batchSize,
  dryRun,
  deduplicate,
  checked,
  onCheck
}: {
  mode: SourceMode;
  sourceLabel: string;
  baseUrl: string;
  queueFilter: string;
  statusFilter: string;
  dateRangeDays: string;
  maxTickets: string;
  batchSize: string;
  dryRun: boolean;
  deduplicate: boolean;
  checked: boolean;
  onCheck: () => void;
}) {
  const maxTicketCount = toPositiveNumber(maxTickets, 100);
  const batchTicketCount = toPositiveNumber(batchSize, 25);
  const periodDays = toPositiveNumber(dateRangeDays, 30);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4 text-sm leading-5 text-[#344054] md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase text-[#667085]">Источник</p>
          <p className="mt-1 font-semibold text-[#17202a]">{sourceLabel}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-[#667085]">Base URL</p>
          <p className="mt-1 break-words font-semibold text-[#17202a]">{normalizeBaseUrl(baseUrl) || "Не указан"}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-[#667085]">Объем</p>
          <p className="mt-1">
            до {maxTicketCount} тикетов за {periodDays} дн., батч {batchTicketCount}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-[#667085]">Фильтры</p>
          <p className="mt-1 break-words">
            {[queueFilter, statusFilter].filter(Boolean).join(" · ") || "Без дополнительных фильтров"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-[#667085]">Режим запуска</p>
          <p className="mt-1">{dryRun ? "Dry-run перед импортом" : "Сразу импортировать после успешной проверки"}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-[#667085]">Дубликаты</p>
          <p className="mt-1">{deduplicate ? "Пропускать повторы" : "Разрешить повторную загрузку"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onCheck}
          className="rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]"
        >
          Проверить подключение и preview
        </button>
        <span className="text-sm leading-5 text-[#667085]">
          Проверка не создает тикеты; импорт будет подтверждаться автоматическим запуском с лимитами.
        </span>
      </div>

      {checked ? (
        <div className="flex min-w-0 items-start gap-3 rounded-md border border-[#b7dfcb] bg-[#e8f3ef] p-4 text-sm leading-5 text-[#116466]">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold text-[#17202a]">Preview готов</p>
            <p>
              Подключение принято для {sourceLabel}. При запуске автоматики будет обработано не больше {maxTicketCount} тикетов
              батчами по {batchTicketCount}; найденные дубликаты будут {deduplicate ? "пропущены" : "загружены повторно"}.
            </p>
          </div>
        </div>
      ) : null}

      {mode === "custom_api" ? (
        <div className="rounded-md border border-[#d7dce5] bg-white p-3 text-sm leading-5 text-[#667085]">
          Для custom API preview считается успешным после валидного `Authorization` и первого ответа на импорт диалога.
        </div>
      ) : null}
    </div>
  );
}

function DoneStep({ checked }: { checked: boolean }) {
  return (
    <div className="grid gap-4">
      <div className="flex min-w-0 items-start gap-3 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4 text-sm leading-5 text-[#344054]">
        <ShieldCheck className="mt-0.5 shrink-0 text-[#116466]" size={20} aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-[#17202a]">Настройка готова к первому ограниченному запуску</p>
          <p>
            {checked
              ? "Preview уже пройден. Следующий шаг - сохранить подключение и включить расписание импорта."
              : "Перед включением расписания вернитесь на шаг preview и проверьте подключение."}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/reviews"
          className="rounded border border-[#d7dce5] bg-white px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#eef4f4]"
        >
          Открыть очередь
        </Link>
        <Link
          href="/admin/audit"
          className="rounded border border-[#d7dce5] bg-white px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#eef4f4]"
        >
          Проверить аудит
        </Link>
      </div>
    </div>
  );
}

function TechnicalDetailsForMode({
  mode,
  nativeSource,
  otrsSource,
  otrsBaseUrl,
  userLogin,
  password,
  ticketId,
  useWrappedBody
}: {
  mode: SourceMode;
  nativeSource: NativeHelpdeskSource;
  otrsSource: OtrsFamilySource;
  otrsBaseUrl: string;
  userLogin: string;
  password: string;
  ticketId: string;
  useWrappedBody: boolean;
}) {
  const otrsProfile = otrsFamilyProfileForSource(otrsSource);
  const ticketGetUrl = otrsFamilyTicketGetUrl(otrsProfile, ticketId.trim() || "42", normalizeBaseUrl(otrsBaseUrl));
  const ticketGetQueryUrl = otrsFamilyUrlWithQuery(
    ticketGetUrl,
    buildOtrsFamilyTicketGetQueryParams(otrsProfile, {
      userLogin: userLogin.trim() || "agent_login",
      password: password ? "[hidden]" : "[empty]",
      ticketId: ticketId.trim() || "42"
    })
  );
  const ticketGetCurl = [`curl -X ${otrsProfile.ticketGetMethod} "${ticketGetQueryUrl}"`, `  -H "Accept: application/json"`].join(
    " \\\n"
  );
  const ticketGetRequest = JSON.stringify(
    buildOtrsFamilyTicketGetRequest({
      userLogin: userLogin.trim() || "agent_login",
      password: password ? "[hidden]" : "[empty]",
      ticketId: ticketId.trim() || "42",
      wrapped: useWrappedBody
    }),
    null,
    2
  );

  if (mode === "otrs_family") {
    return (
      <TechnicalDetails title="Технические детали OTRS-family">
        <div className="grid gap-5">
          <div className="grid gap-4 xl:grid-cols-2">
            <CodeExampleCard title="TicketGet URL и query" className="self-start">
              {ticketGetCurl}
            </CodeExampleCard>
            <CodeExampleCard title="Fallback JSON body" className="self-start">
              {ticketGetRequest}
            </CodeExampleCard>
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <DataTable title="Mapping в custom API" minWidth="min-w-[640px]">
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
            <CodeExampleCard title="Fallback endpoint native-импорта" className="self-start">
              {otrsImportCurl}
            </CodeExampleCard>
          </div>

          <div className="grid gap-3 text-sm leading-5 text-[#667085] md:grid-cols-2">
            {otrsFamilyRequestShapeNotes.map((note) => (
              <div key={note.title} className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
                <p className="font-semibold text-[#17202a]">{note.title}</p>
                <p className="mt-1">{note.detail}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
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
    );
  }

  if (mode === "native_helpdesk") {
    return (
      <TechnicalDetails title="Mapping и endpoint native-адаптера">
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <DataTable
            title="Mapping в custom API"
            description="Как native-поля превращаются в единый формат ручной проверки."
            minWidth="min-w-[640px]"
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
            {nativeImportCurl(nativeSource)}
          </CodeExampleCard>
        </div>
      </TechnicalDetails>
    );
  }

  return (
    <TechnicalDetails title="Технический контракт custom API">
      <div className="grid gap-5">
        <DataTable title="Endpoint-карта" minWidth="min-w-[720px]">
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
  const [step, setStep] = useState<WizardStep>("source");
  const [mode, setMode] = useState<SourceMode>("otrs_family");
  const [nativeSource, setNativeSource] = useState<NativeHelpdeskSource>("zendesk");
  const [otrsSource, setOtrsSource] = useState<OtrsFamilySource>("znuny");
  const [otrsBaseUrl, setOtrsBaseUrl] = useState<string>(otrsFamilyProfileForSource("znuny").exampleBaseUrl);
  const [userLogin, setUserLogin] = useState("agent_login");
  const [password, setPassword] = useState("");
  const [ticketId, setTicketId] = useState("42");
  const [nativeBaseUrl, setNativeBaseUrl] = useState("https://support.example.com");
  const [nativeToken, setNativeToken] = useState("");
  const [customSystemName, setCustomSystemName] = useState("Внутренний helpdesk");
  const [customBaseUrl, setCustomBaseUrl] = useState("https://helpdesk.internal.example.com");
  const [dateRangeDays, setDateRangeDays] = useState("30");
  const [maxTickets, setMaxTickets] = useState("100");
  const [batchSize, setBatchSize] = useState("25");
  const [queueFilter, setQueueFilter] = useState("Support::Refunds");
  const [statusFilter, setStatusFilter] = useState("open, closed");
  const [dryRun, setDryRun] = useState(true);
  const [deduplicate, setDeduplicate] = useState(true);
  const [checked, setChecked] = useState(false);
  const useWrappedBody = false;

  const currentStepIndex = wizardSteps.findIndex((item) => item.value === step);
  const safeStepIndex = currentStepIndex >= 0 ? currentStepIndex : 0;
  const currentStep = wizardSteps[safeStepIndex];
  const selectedSourceLabel = useMemo(() => {
    if (mode === "native_helpdesk") {
      return nativeSourceInfo(nativeSource).label;
    }

    if (mode === "otrs_family") {
      return otrsFamilyProfileForSource(otrsSource).shortLabel;
    }

    return customSystemName.trim() || sourceModeLabels.custom_api;
  }, [customSystemName, mode, nativeSource, otrsSource]);
  const activeBaseUrl =
    mode === "otrs_family" ? otrsBaseUrl : mode === "native_helpdesk" ? nativeBaseUrl : customBaseUrl;

  function resetCheck() {
    setChecked(false);
  }

  function goNext() {
    const nextIndex = Math.min(safeStepIndex + 1, wizardSteps.length - 1);
    setStep(wizardSteps[nextIndex].value);
  }

  function goBack() {
    const previousIndex = Math.max(safeStepIndex - 1, 0);
    setStep(wizardSteps[previousIndex].value);
  }

  function changeMode(nextMode: SourceMode) {
    setMode(nextMode);
    resetCheck();
  }

  function changeNativeSource(nextSource: NativeHelpdeskSource) {
    setNativeSource(nextSource);
    resetCheck();
  }

  function changeOtrsSource(nextSource: OtrsFamilySource) {
    setOtrsSource(nextSource);
    setOtrsBaseUrl(otrsFamilyProfileForSource(nextSource).exampleBaseUrl);
    resetCheck();
  }

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[#d7dce5] bg-white px-5 py-4">
        <p className="text-sm font-medium text-[#667085]">Новая интеграция</p>
        <h2 className="mt-1 text-lg font-semibold text-[#17202a]">Мастер подключения источника</h2>
        <p className="mt-1 max-w-3xl text-sm leading-5 text-[#667085]">
          Один последовательный поток: источник, доступ, лимиты, preview и безопасный первый запуск.
        </p>
      </div>

      <div className="grid gap-5 p-5">
        <WizardFrame
          currentStepIndex={safeStepIndex}
          title={currentStep.title}
          description={
            step === "source"
              ? "Сначала выберите тип источника. Следующие шаги появятся после перехода дальше."
              : step === "access"
                ? "Введите только данные, нужные для проверки доступа. Технические примеры скрыты ниже."
                : step === "limits"
                  ? "Ограничьте первый запуск, чтобы не импортировать большой архив случайно."
                  : step === "preview"
                    ? "Проверьте подключение и оцените объем до включения автоматики."
                    : "Подключение собрано в ограниченный и контролируемый сценарий запуска."
          }
          sourceLabel={selectedSourceLabel}
          onBack={safeStepIndex > 0 ? goBack : undefined}
          onNext={step === "done" ? undefined : goNext}
          nextLabel={step === "preview" ? "Сохранить настройку" : "Далее"}
          nextDisabled={step === "preview" && !checked}
        >
          {step === "source" ? (
            <SourceChoiceStep
              mode={mode}
              nativeSource={nativeSource}
              onModeChange={changeMode}
              onNativeSourceChange={changeNativeSource}
            />
          ) : null}

          {step === "access" ? (
            <AccessStep
              mode={mode}
              nativeSource={nativeSource}
              otrsSource={otrsSource}
              otrsBaseUrl={otrsBaseUrl}
              userLogin={userLogin}
              password={password}
              ticketId={ticketId}
              nativeBaseUrl={nativeBaseUrl}
              nativeToken={nativeToken}
              customSystemName={customSystemName}
              customBaseUrl={customBaseUrl}
              apiTokenCount={apiTokenCount}
              apiHealth={apiHealth}
              onOtrsSourceChange={changeOtrsSource}
              onOtrsBaseUrlChange={(value) => {
                setOtrsBaseUrl(value);
                resetCheck();
              }}
              onUserLoginChange={(value) => {
                setUserLogin(value);
                resetCheck();
              }}
              onPasswordChange={(value) => {
                setPassword(value);
                resetCheck();
              }}
              onTicketIdChange={(value) => {
                setTicketId(value);
                resetCheck();
              }}
              onNativeBaseUrlChange={(value) => {
                setNativeBaseUrl(value);
                resetCheck();
              }}
              onNativeTokenChange={(value) => {
                setNativeToken(value);
                resetCheck();
              }}
              onCustomSystemNameChange={(value) => {
                setCustomSystemName(value);
                resetCheck();
              }}
              onCustomBaseUrlChange={(value) => {
                setCustomBaseUrl(value);
                resetCheck();
              }}
            />
          ) : null}

          {step === "limits" ? (
            <LimitsStep
              dateRangeDays={dateRangeDays}
              maxTickets={maxTickets}
              batchSize={batchSize}
              queueFilter={queueFilter}
              statusFilter={statusFilter}
              dryRun={dryRun}
              deduplicate={deduplicate}
              onDateRangeDaysChange={(value) => {
                setDateRangeDays(value);
                resetCheck();
              }}
              onMaxTicketsChange={(value) => {
                setMaxTickets(value);
                resetCheck();
              }}
              onBatchSizeChange={(value) => {
                setBatchSize(value);
                resetCheck();
              }}
              onQueueFilterChange={(value) => {
                setQueueFilter(value);
                resetCheck();
              }}
              onStatusFilterChange={(value) => {
                setStatusFilter(value);
                resetCheck();
              }}
              onDryRunChange={(value) => {
                setDryRun(value);
                resetCheck();
              }}
              onDeduplicateChange={(value) => {
                setDeduplicate(value);
                resetCheck();
              }}
            />
          ) : null}

          {step === "preview" ? (
            <PreviewStep
              mode={mode}
              sourceLabel={selectedSourceLabel}
              baseUrl={activeBaseUrl}
              queueFilter={queueFilter}
              statusFilter={statusFilter}
              dateRangeDays={dateRangeDays}
              maxTickets={maxTickets}
              batchSize={batchSize}
              dryRun={dryRun}
              deduplicate={deduplicate}
              checked={checked}
              onCheck={() => setChecked(true)}
            />
          ) : null}

          {step === "done" ? <DoneStep checked={checked} /> : null}
        </WizardFrame>

        <TechnicalDetailsForMode
          mode={mode}
          nativeSource={nativeSource}
          otrsSource={otrsSource}
          otrsBaseUrl={otrsBaseUrl}
          userLogin={userLogin}
          password={password}
          ticketId={ticketId}
          useWrappedBody={useWrappedBody}
        />
      </div>
    </section>
  );
}
