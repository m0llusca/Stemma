"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { connectSourceAction, type ConnectJournalState } from "@/lib/connect-actions";
import type { ConnectStep, ConnectStepStatus, CredentialField } from "@/lib/integrations/connect/types";

export type ConnectSourceItem = {
  source: string;
  label: string;
  type: string;
  urlPolicy: "required" | "fixed" | "optional";
  fixedBaseUrl?: string;
  fields: CredentialField[];
  limited?: boolean;
};

const labelClass = "grid gap-1.5 text-sm font-medium text-[#334155]";
const fieldClass = "form-control h-10 w-full text-sm";

const STEP_LABELS: Record<string, string> = {
  validate_url: "Адрес проверен",
  reachability: "Сервер отвечает",
  auto_detect: "Автоопределение",
  verify_auth: "Авторизация",
  persist: "Источник подключён",
  test_import: "Пробный импорт"
};

const STATUS_ICONS: Record<ConnectStepStatus, string> = {
  ok: "✓",
  warning: "⚠",
  failed: "✗",
  skipped: "○"
};

const STATUS_COLORS: Record<ConnectStepStatus, string> = {
  ok: "text-[#166534]",
  warning: "text-[#b45309]",
  failed: "text-[#b91c1c]",
  skipped: "text-[#64748b]"
};

// Шаги, которые можно поправить вручную в расширенных настройках — при их сбое
// блок «Расширенные настройки» открывается автоматически.
const MANUAL_FIXABLE_STEPS = new Set(["auto_detect", "verify_auth"]);

function hasSteps(state: ConnectJournalState): state is { steps: ConnectStep[]; connected: boolean; integrationId?: string } {
  return Boolean(state && "steps" in state);
}

function hasError(state: ConnectJournalState): state is { error: string } {
  return Boolean(state && "error" in state);
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="action-button action-button--primary" disabled={pending}>
      {pending ? "Подключаем..." : "Подключить"}
    </button>
  );
}

export function ConnectSourceForm({
  sources,
  initialState
}: {
  sources: ConnectSourceItem[];
  initialState?: ConnectJournalState;
}) {
  const [state, formAction] = useActionState(connectSourceAction, initialState ?? null);
  const [selectedSource, setSelectedSource] = useState<string | null>(
    sources.length === 1 ? sources[0].source : null
  );

  const selected = useMemo(
    () => sources.find((item) => item.source === selectedSource) ?? null,
    [sources, selectedSource]
  );

  const steps = hasSteps(state) ? state.steps : [];
  const fallbackOpen = steps.some(
    (step) => step.status === "failed" && MANUAL_FIXABLE_STEPS.has(step.step)
  );
  const connected = hasSteps(state) && state.connected;

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[#d9e0ea] px-5 py-4">
        <h2 className="text-lg font-semibold">Подключение источника</h2>
        <p className="mt-1 text-sm leading-5 text-[#64748b]">
          Выберите тип источника, укажите адрес и учётные данные — подключение пройдёт автоматически.
        </p>
      </div>

      {sources.length > 0 ? (
        <div className="grid gap-2 border-b border-[#d9e0ea] px-4 py-4">
          <p className="text-sm font-medium text-[#334155]">Тип источника</p>
          <div className="flex flex-wrap gap-2">
            {sources.map((item) => {
              const isActive = item.source === selectedSource;
              return (
                <button
                  key={item.source}
                  type="button"
                  onClick={() => setSelectedSource(item.source)}
                  aria-pressed={isActive}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]"
                      : "border-[#d9e0ea] bg-white text-[#334155] hover:border-[#94a3b8]"
                  }`}
                >
                  {item.label}
                  {item.limited ? (
                    <span className="rounded-full bg-[#fef3c7] px-2 py-0.5 text-[11px] font-semibold text-[#92400e]">
                      ограниченная поддержка
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {selected ? (
        <form action={formAction} className="grid gap-4 px-4 py-4">
          <input type="hidden" name="source" value={selected.source} />

          {selected.urlPolicy === "fixed" ? (
            <input type="hidden" name="baseUrl" value={selected.fixedBaseUrl ?? ""} />
          ) : (
            <label className={labelClass}>
              Адрес источника
              <input
                name="baseUrl"
                type="url"
                required={selected.urlPolicy === "required"}
                placeholder="https://example.zendesk.com"
                className={fieldClass}
              />
            </label>
          )}

          {selected.fields.map((field) => (
            <label key={field.key} className={labelClass}>
              {field.label}
              <input
                name={field.key}
                type={field.secret ? "password" : "text"}
                placeholder={field.placeholder}
                pattern={field.format}
                autoComplete={field.secret ? "new-password" : "off"}
                className={fieldClass}
              />
              {field.hint ? <span className="text-xs font-normal text-[#64748b]">{field.hint}</span> : null}
            </label>
          ))}

          <label className={labelClass}>
            № тикета (необязательно)
            <input name="testTicketId" type="text" className={fieldClass} />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton />
          </div>
        </form>
      ) : sources.length > 0 ? (
        <p className="px-4 py-4 text-sm text-[#64748b]">Выберите тип источника, чтобы продолжить.</p>
      ) : null}

      {hasError(state) ? (
        <p className="px-4 pb-4 text-sm font-medium text-[#b91c1c]">{state.error}</p>
      ) : null}

      {steps.length > 0 ? (
        <div className="grid gap-2 border-t border-[#d9e0ea] px-4 py-4">
          <p className="text-sm font-semibold text-[#334155]">Ход подключения</p>
          <ul className="grid gap-2">
            {steps.map((step) => (
              <li key={step.step} className="flex items-start gap-2 text-sm">
                <span className={`mt-0.5 font-semibold ${STATUS_COLORS[step.status]}`} aria-hidden="true">
                  {STATUS_ICONS[step.status]}
                </span>
                <span className="grid gap-0.5">
                  <span className="font-medium text-[#334155]">{STEP_LABELS[step.step] ?? step.step}</span>
                  {step.detail ? <span className="text-[#475569]">{step.detail}</span> : null}
                  {step.hint ? (
                    <span className={`text-xs ${step.status === "failed" ? "text-[#b91c1c]" : "text-[#64748b]"}`}>
                      {step.hint}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {connected ? (
            <p className="text-sm font-semibold text-[#166534]">Источник подключён</p>
          ) : null}
        </div>
      ) : null}

      <details open={fallbackOpen} className="compact-details disclosure-panel overflow-hidden border-t border-[#d9e0ea]">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#334155]">
          Расширенные настройки
        </summary>
        <div className="grid gap-2 border-t border-[#d9e0ea] p-4 text-sm text-[#475569]">
          {fallbackOpen ? (
            <p className="font-medium text-[#b45309]">Заполните параметры вручную и повторите.</p>
          ) : (
            <p>Ручная настройка параметров подключения для нестандартных конфигураций.</p>
          )}
        </div>
      </details>
    </section>
  );
}
