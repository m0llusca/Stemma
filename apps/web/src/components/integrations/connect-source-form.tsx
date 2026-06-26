"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { SourceLogoMark, sourceLogoMeta } from "@/components/integrations/source-logo-mark";
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

const labelClass = "grid gap-1.5 text-sm font-medium text-[var(--text-body)]";
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
  ok: "text-[var(--success)]",
  warning: "text-[var(--warning)]",
  failed: "text-[var(--danger)]",
  skipped: "text-[var(--text-muted)]"
};

const SOURCE_GROUPS: Array<{ type: string; title: string }> = [
  { type: "otrs_family", title: "Семейство OTRS" },
  { type: "native_helpdesk", title: "Хелпдески и CRM" },
  { type: "enterprise", title: "Enterprise-платформы" },
  { type: "data_source", title: "Хранилища данных" }
];

function sourceMeta(item: ConnectSourceItem) {
  return sourceLogoMeta(item.source, item.label);
}

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
  const groups = useMemo(() => {
    const known = SOURCE_GROUPS.map((group) => ({
      ...group,
      items: sources.filter((item) => item.type === group.type)
    })).filter((group) => group.items.length > 0);
    const knownTypes = new Set(SOURCE_GROUPS.map((group) => group.type));
    const rest = sources.filter((item) => !knownTypes.has(item.type));
    return rest.length > 0 ? [...known, { type: "other", title: "Другие источники", items: rest }] : known;
  }, [sources]);

  const steps = hasSteps(state) ? state.steps : [];
  const fallbackOpen = steps.some(
    (step) => step.status === "failed" && MANUAL_FIXABLE_STEPS.has(step.step)
  );
  const connected = hasSteps(state) && state.connected;

  return (
    <section className="panel overflow-clip">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-lg font-semibold">Подключение источника</h2>
        <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
          Выберите тип источника, укажите адрес и учётные данные — подключение пройдёт автоматически.
        </p>
      </div>

      {sources.length > 0 ? (
        <div className="connect-source-groups border-b border-[var(--border)] px-4 py-4">
          {groups.map((group) => (
            <div key={group.type} className="connect-source-group">
              <p className="connect-source-group__title">{group.title}</p>
              <div className="connect-source-grid" role="radiogroup" aria-label={group.title}>
                {group.items.map((item) => {
                  const isActive = item.source === selectedSource;
                  const meta = sourceMeta(item);

                  return (
                    <button
                      key={item.source}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => setSelectedSource(item.source)}
                      className={`connect-source-card ${isActive ? "connect-source-card--selected" : ""}`}
                    >
                      <SourceLogoMark meta={meta} />
                      <span className="connect-source-card__body">
                        <span className="connect-source-card__name">
                          {item.label}
                          {item.limited ? <span className="connect-source-card__flag">ограниченно</span> : null}
                        </span>
                        <span className="connect-source-card__hint">{meta.hint}</span>
                      </span>
                      <span className={`connect-source-card__check ${isActive ? "connect-source-card__check--on" : ""}`} aria-hidden="true">
                        <Check size={14} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {selected ? (
        <form action={formAction} className="grid gap-4 px-4 py-4">
          <input type="hidden" name="source" value={selected.source} />

          <div className="connect-source-current" aria-live="polite">
            <SourceLogoMark meta={sourceMeta(selected)} />
            <span className="connect-source-current__body">
              <strong>{selected.label}</strong>
              <span>{sourceMeta(selected).hint}</span>
            </span>
          </div>

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
              {field.hint ? <span className="text-xs font-normal text-[var(--text-muted)]">{field.hint}</span> : null}
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
        <p className="px-4 py-4 text-sm text-[var(--text-muted)]">Выберите тип источника, чтобы продолжить.</p>
      ) : null}

      {hasError(state) ? (
        <p className="px-4 pb-4 text-sm font-medium text-[var(--danger)]">{state.error}</p>
      ) : null}

      {steps.length > 0 ? (
        <div className="grid gap-2 border-t border-[var(--border)] px-4 py-4">
          <p className="text-sm font-semibold text-[var(--text-body)]">Ход подключения</p>
          <ul className="grid gap-2">
            {steps.map((step) => (
              <li key={step.step} className="flex items-start gap-2 text-sm">
                <span className={`mt-0.5 font-semibold ${STATUS_COLORS[step.status]}`} aria-hidden="true">
                  {STATUS_ICONS[step.status]}
                </span>
                <span className="grid gap-0.5">
                  <span className="font-medium text-[var(--text-body)]">{STEP_LABELS[step.step] ?? step.step}</span>
                  {step.detail ? <span className="text-[var(--text-subtle)]">{step.detail}</span> : null}
                  {step.hint ? (
                    <span className={`text-xs ${step.status === "failed" ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
                      {step.hint}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {connected ? (
            <p className="text-sm font-semibold text-[var(--success)]">Источник подключён</p>
          ) : null}
        </div>
      ) : null}

      <details open={fallbackOpen} className="compact-details disclosure-panel overflow-clip border-t border-[var(--border)]">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[var(--text-body)]">
          Расширенные настройки
        </summary>
        <div className="grid gap-2 border-t border-[var(--border)] p-4 text-sm text-[var(--text-subtle)]">
          {fallbackOpen ? (
            <p className="font-medium text-[var(--warning)]">Заполните параметры вручную и повторите.</p>
          ) : (
            <p>Ручная настройка параметров подключения для нестандартных конфигураций.</p>
          )}
        </div>
      </details>
    </section>
  );
}
