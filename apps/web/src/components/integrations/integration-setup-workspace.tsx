"use client";

import Link from "next/link";
import { CheckCircle2, ChevronDown, ShieldCheck } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { CodeExampleCard, DataTable } from "@/components/integrations/integration-ui";
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
import { recordIntegrationDryRun } from "@/lib/integration-actions";
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
type SourceOptionValue = `otrs:${OtrsFamilySource}` | `native:${NativeHelpdeskSource}` | "custom_api";

const fieldClass = "h-10 w-full min-w-0 rounded border border-[#d7dce5] bg-white px-3 py-2 text-sm text-[#17202a]";
const primaryButtonClass = "rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]";
const secondaryButtonClass =
  "rounded border border-[#d7dce5] bg-white px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#eef4f4]";
const smallButtonClass =
  "rounded border border-[#d7dce5] bg-white px-3 py-2 text-xs font-semibold text-[#344054] hover:bg-[#eef4f4]";

const sourceModeLabels: Record<SourceMode, string> = {
  otrs_family: "OTRS / Znuny / OTOBO",
  native_helpdesk: "Облачные helpdesk",
  custom_api: "Своя система"
};

const sourceModeDescriptions: Record<SourceMode, string> = {
  otrs_family: "Подключение через GenericInterface TicketGet с безопасной проверкой перед запуском.",
  native_helpdesk: "Импорт тикетов и сообщений из популярных облачных helpdesk через готовые адаптеры.",
  custom_api: "Единый API-контракт для внутренних систем и нестандартных helpdesk."
};

const sourceOptions = [
  ...otrsFamilySourceOptions.map((source) => ({
    value: `otrs:${source.value}` as const,
    label: source.label,
    mode: "otrs_family" as const,
    description:
      source.value === "otrs_family"
        ? sourceModeDescriptions.otrs_family
        : otrsFamilyProfileForSource(source.value).note
  })),
  ...nativeHelpdeskSources.map((source) => ({
    value: `native:${source.value}` as const,
    label: source.label,
    mode: "native_helpdesk" as const,
    description: `${source.objectName}. ${source.endpointHint}`
  })),
  {
    value: "custom_api" as const,
    label: "Своя система через API",
    mode: "custom_api" as const,
    description: sourceModeDescriptions.custom_api
  }
] satisfies Array<{
  value: SourceOptionValue;
  label: string;
  mode: SourceMode;
  description: string;
}>;

const wizardSteps: Array<{ value: WizardStep; label: string; title: string }> = [
  { value: "source", label: "Источник", title: "Шаг 1. Источник" },
  { value: "access", label: "Доступ", title: "Шаг 2. Доступ" },
  { value: "limits", label: "Лимиты", title: "Шаг 3. Лимиты" },
  { value: "preview", label: "Проверка", title: "Шаг 4. Проверка" },
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
    samplingReason: `Импорт ${info.label}: тикет/диалог и история сообщений.`,
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

function FormField({
  label,
  children,
  className = ""
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid min-w-0 content-start gap-1.5 text-sm font-medium text-[#344054] ${className}`}>
      <span className="min-w-0 break-words">{label}</span>
      {children}
    </label>
  );
}

function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[58px] min-w-0 content-start gap-1 rounded-md bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase text-[#667085]">{label}</p>
      <div className="min-w-0 break-words text-sm leading-5 text-[#344054]">{children}</div>
    </div>
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
    <div className="grid gap-4">
      <div className="grid gap-3 border-b border-[#d7dce5] pb-4">
        <div className="min-w-0">
          {currentStepIndex > 0 ? (
            <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold uppercase text-[#667085]">
              <span>Источник</span>
              <span className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] px-2 py-1 normal-case text-[#0b4f52]">
                {sourceLabel}
              </span>
            </div>
          ) : null}
          <StepProgress currentStepIndex={currentStepIndex} />
          <h3 className="mt-2 text-base font-semibold text-[#17202a]">{title}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-[#667085]">{description}</p>
        </div>
      </div>

      {children}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#d7dce5] pt-4">
        <button
          type="button"
          onClick={onBack}
          disabled={!onBack}
          className={`${secondaryButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Назад
        </button>
        {onNext ? (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:bg-[#98a2b3]`}
          >
            {nextLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SourceChoiceStep({
  sourceValue,
  onSourceChange
}: {
  sourceValue: SourceOptionValue;
  onSourceChange: (value: SourceOptionValue) => void;
}) {
  const selectedOption = sourceOptions.find((option) => option.value === sourceValue) ?? sourceOptions[0];

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <FormField label="Источник">
        <select
          value={sourceValue}
          onChange={(event) => onSourceChange(event.target.value as SourceOptionValue)}
          className={fieldClass}
        >
          <optgroup label="OTRS / Znuny / OTOBO">
            {sourceOptions
              .filter((option) => option.mode === "otrs_family")
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </optgroup>
          <optgroup label="Облачные helpdesk">
            {sourceOptions
              .filter((option) => option.mode === "native_helpdesk")
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </optgroup>
          <optgroup label="Другое">
            {sourceOptions
              .filter((option) => option.mode === "custom_api")
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </optgroup>
        </select>
      </FormField>

      <div className="min-w-0 rounded-md border border-[#d7dce5] bg-[#fbfcfd] px-3 py-2">
        <p className="text-xs font-semibold uppercase text-[#667085]">Что будет настроено</p>
        <p className="mt-1 text-sm leading-5 text-[#344054]">{selectedOption.description}</p>
      </div>
    </div>
  );
}

function AccessStep({
  mode,
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
        <FormField label="Base URL">
          <input value={otrsBaseUrl} onChange={(event) => onOtrsBaseUrlChange(event.target.value)} className={fieldClass} />
        </FormField>
        <FormField label="UserLogin">
          <input value={userLogin} onChange={(event) => onUserLoginChange(event.target.value)} className={fieldClass} />
        </FormField>
        <FormField label="Password">
          <input
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            type="password"
            className={fieldClass}
          />
        </FormField>
        <FormField label="TicketID для проверки">
          <input value={ticketId} onChange={(event) => onTicketIdChange(event.target.value)} className={fieldClass} />
        </FormField>
      </div>
    );
  }

  if (mode === "native_helpdesk") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Base URL">
          <input value={nativeBaseUrl} onChange={(event) => onNativeBaseUrlChange(event.target.value)} className={fieldClass} />
        </FormField>
        <FormField label="Ключ API или секрет приложения">
          <input
            value={nativeToken}
            onChange={(event) => onNativeTokenChange(event.target.value)}
            type="password"
            placeholder="Будет храниться в секретах окружения"
            className={fieldClass}
          />
        </FormField>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
        <FormField label="Название системы">
          <input value={customSystemName} onChange={(event) => onCustomSystemNameChange(event.target.value)} className={fieldClass} />
        </FormField>
        <FormField label="Base URL источника">
          <input value={customBaseUrl} onChange={(event) => onCustomBaseUrlChange(event.target.value)} className={fieldClass} />
        </FormField>
      </div>
      <div className="grid min-h-full content-start gap-3 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3 text-sm leading-5 text-[#667085]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`w-fit rounded-md px-2 py-1 text-xs font-semibold ${apiHealth.className}`}>{apiHealth.label}</span>
          <span className="text-xs font-semibold uppercase text-[#667085]">Свой API</span>
        </div>
        <p className="break-words">{apiTokenCount} ключ(а) API в рабочем пространстве.</p>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={`Authorization: Bearer ${apiTokenPlaceholder}`} label="Скопировать заголовок" />
          <Link href="/admin/tokens" className={smallButtonClass}>
            API-доступ
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
        <FormField label="Период, дней">
          <input
            value={dateRangeDays}
            onChange={(event) => onDateRangeDaysChange(event.target.value)}
            type="number"
            min="1"
            max="365"
            className={fieldClass}
          />
        </FormField>
        <FormField label="Максимум тикетов">
          <input
            value={maxTickets}
            onChange={(event) => onMaxTicketsChange(event.target.value)}
            type="number"
            min="1"
            max="1000"
            className={fieldClass}
          />
        </FormField>
        <FormField label="Размер батча">
          <input
            value={batchSize}
            onChange={(event) => onBatchSizeChange(event.target.value)}
            type="number"
            min="1"
            max="100"
            className={fieldClass}
          />
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Очередь, группа или inbox">
          <input value={queueFilter} onChange={(event) => onQueueFilterChange(event.target.value)} className={fieldClass} />
        </FormField>
        <FormField label="Статусы или теги">
          <input value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)} className={fieldClass} />
        </FormField>
      </div>

      <div className="grid gap-3 text-sm text-[#344054] md:grid-cols-2">
        <label className="grid min-h-[76px] min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(event) => onDryRunChange(event.target.checked)}
            className="mt-1"
          />
          <span className="min-w-0 leading-5">
            Сначала пробный запуск: проверить доступ и объем без создания записей в очереди.
          </span>
        </label>
        <label className="grid min-h-[76px] min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
          <input
            type="checkbox"
            checked={deduplicate}
            onChange={(event) => onDeduplicateChange(event.target.checked)}
            className="mt-1"
          />
          <span className="min-w-0 leading-5">
            Не создавать дубликаты по источнику и внешнему номеру обращения.
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
  sourceKey,
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
  sourceKey: string;
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
      <div className="grid gap-3 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3 md:grid-cols-2">
        <SummaryItem label="Источник">
          <span className="font-semibold text-[#17202a]">{sourceLabel}</span>
        </SummaryItem>
        <SummaryItem label="Base URL">
          <span className="font-semibold text-[#17202a]">{normalizeBaseUrl(baseUrl) || "Не указан"}</span>
        </SummaryItem>
        <SummaryItem label="Объем">
          <span>
            до {maxTicketCount} тикетов за {periodDays} дн., батч {batchTicketCount}
          </span>
        </SummaryItem>
        <SummaryItem label="Фильтры">
          <span>
            {[queueFilter, statusFilter].filter(Boolean).join(" · ") || "Без дополнительных фильтров"}
          </span>
        </SummaryItem>
        <SummaryItem label="Режим запуска">
          <span>{dryRun ? "Пробный запуск перед импортом" : "Сразу импортировать после успешной проверки"}</span>
        </SummaryItem>
        <SummaryItem label="Дубликаты">
          <span>{deduplicate ? "Пропускать повторы" : "Разрешить повторную загрузку"}</span>
        </SummaryItem>
      </div>

      <div className="grid gap-3 rounded-md border border-[#d7dce5] bg-white p-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onCheck} className={primaryButtonClass}>
            Проверить подключение
          </button>
          <form action={recordIntegrationDryRun}>
            <input type="hidden" name="source" value={sourceKey} />
            <input type="hidden" name="sourceLabel" value={sourceLabel} />
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="baseUrl" value={normalizeBaseUrl(baseUrl)} />
            <input type="hidden" name="maxTickets" value={maxTickets} />
            <input type="hidden" name="batchSize" value={batchSize} />
            <input type="hidden" name="dateRangeDays" value={dateRangeDays} />
            <button type="submit" className={secondaryButtonClass}>
              Записать пробный запуск
            </button>
          </form>
        </div>
        <span className="text-sm leading-5 text-[#667085]">
          Проверка не создает тикеты; импорт будет подтверждаться автоматическим запуском с лимитами.
        </span>
      </div>

      {checked ? (
        <div className="flex min-w-0 items-start gap-3 rounded-md border border-[#b7dfcb] bg-[#e8f3ef] p-4 text-sm leading-5 text-[#116466]">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold text-[#17202a]">Подключение проверено</p>
            <p>
              Подключение принято для {sourceLabel}. При запуске автоматики будет обработано не больше {maxTicketCount} тикетов
              батчами по {batchTicketCount}; найденные дубликаты будут {deduplicate ? "пропущены" : "загружены повторно"}.
            </p>
          </div>
        </div>
      ) : null}

      {mode === "custom_api" ? (
        <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3 text-sm leading-5 text-[#667085]">
          Для своего API проверка считается успешной после валидного `Authorization` и первого ответа на импорт диалога.
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
              ? "Проверка уже пройдена. Следующий шаг - сохранить подключение и включить расписание импорта."
              : "Перед включением расписания вернитесь на шаг проверки и проверьте подключение."}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/reviews" className={secondaryButtonClass}>
          Открыть очередь
        </Link>
        <Link href="/admin/audit" className={secondaryButtonClass}>
          Открыть журнал
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
          <div className="grid items-stretch gap-4 xl:grid-cols-2">
            <CodeExampleCard title="TicketGet URL и параметры">
              {ticketGetCurl}
            </CodeExampleCard>
            <CodeExampleCard title="Запасной JSON-запрос">
              {ticketGetRequest}
            </CodeExampleCard>
          </div>

          <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <DataTable title="Сопоставление с единым форматом" minWidth="min-w-[640px]">
              <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                <tr>
                  <th className="px-4 py-3 font-semibold">OTRS/Znuny/OTOBO</th>
                  <th className="px-4 py-3 font-semibold">Поле проверки</th>
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
            <CodeExampleCard title="Запасной endpoint импорта">
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
      <TechnicalDetails title="Сопоставление готового адаптера">
        <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <DataTable
            title="Сопоставление с единым форматом"
            description="Как поля источника превращаются в единый формат ручной проверки."
            minWidth="min-w-[640px]"
          >
            <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
              <tr>
                <th className="px-4 py-3 font-semibold">Поле источника</th>
                <th className="px-4 py-3 font-semibold">Поле проверки</th>
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
            title="Endpoint импорта"
            description="Один endpoint принимает разные форматы источников и применяет выбранный адаптер."
          >
            {nativeImportCurl(nativeSource)}
          </CodeExampleCard>
        </div>
      </TechnicalDetails>
    );
  }

  return (
    <TechnicalDetails title="Технический контракт своего API">
      <div className="grid gap-5">
        <DataTable title="Карта endpoint" minWidth="min-w-[720px]">
          <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
            <tr>
              <th className="px-4 py-3 font-semibold">Метод</th>
              <th className="px-4 py-3 font-semibold">Endpoint</th>
              <th className="px-4 py-3 font-semibold">Право доступа</th>
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

        <div className="grid items-stretch gap-4 xl:grid-cols-3">
          <CodeExampleCard title="Импорт диалога">{customConversationImportCurl}</CodeExampleCard>
          <CodeExampleCard title="Добавление сообщения">{customMessageImportCurl}</CodeExampleCard>
          <CodeExampleCard title="Экспорт проверок">{customReviewExportCurl}</CodeExampleCard>
        </div>

        <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
          <CodeExampleCard title="Пример JSON для импорта">
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
  const sourceValue: SourceOptionValue =
    mode === "otrs_family" ? `otrs:${otrsSource}` : mode === "native_helpdesk" ? `native:${nativeSource}` : "custom_api";
  const selectedSourceOption = sourceOptions.find((option) => option.value === sourceValue) ?? sourceOptions[0];
  const selectedSourceLabel = useMemo(() => {
    return mode === "custom_api" ? customSystemName.trim() || selectedSourceOption.label : selectedSourceOption.label;
  }, [customSystemName, mode, selectedSourceOption.label]);
  const selectedSourceKey = mode === "otrs_family" ? otrsSource : mode === "native_helpdesk" ? nativeSource : "custom_api";
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

  function changeSourceOption(nextValue: SourceOptionValue) {
    if (nextValue === "custom_api") {
      setMode("custom_api");
      resetCheck();
      return;
    }

    if (nextValue.startsWith("otrs:")) {
      const nextSource = nextValue.replace("otrs:", "") as OtrsFamilySource;

      setMode("otrs_family");
      setOtrsSource(nextSource);
      setOtrsBaseUrl(otrsFamilyProfileForSource(nextSource).exampleBaseUrl);
      resetCheck();
      return;
    }

    const nextSource = nextValue.replace("native:", "") as NativeHelpdeskSource;

    setMode("native_helpdesk");
    setNativeSource(nextSource);
    resetCheck();
  }

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[#d7dce5] bg-white px-5 py-4">
        <p className="text-sm font-medium text-[#667085]">Новая интеграция</p>
        <h2 className="mt-1 text-lg font-semibold text-[#17202a]">Мастер подключения источника</h2>
        <p className="mt-1 max-w-3xl text-sm leading-5 text-[#667085]">
          Один последовательный поток: источник, доступ, лимиты, проверка и безопасный первый запуск.
        </p>
      </div>

      <div className="grid gap-5 p-5">
        <WizardFrame
          currentStepIndex={safeStepIndex}
          title={currentStep.title}
          description={
            step === "source"
              ? "Сначала выберите конкретный источник. Следующие шаги появятся после перехода дальше."
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
              sourceValue={sourceValue}
              onSourceChange={changeSourceOption}
            />
          ) : null}

          {step === "access" ? (
            <AccessStep
              mode={mode}
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
              sourceKey={selectedSourceKey}
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
