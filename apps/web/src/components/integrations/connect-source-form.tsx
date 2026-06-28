"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { SourceLogoMark, sourceLogoMeta } from "@/components/integrations/source-logo-mark";
import { connectSourceAction, type ConnectJournalState } from "@/lib/connect-actions";
import { nextActionForConnectSteps } from "@/lib/integrations/connect/next-action";
import type { IntegrationInstallState } from "@/lib/integrations/install-contracts/types";
import type { ConnectStep, ConnectStepStatus, CredentialField } from "@/lib/integrations/connect/types";

export type ConnectSourceItem = {
  source: string;
  label: string;
  type: string;
  urlPolicy: "required" | "fixed" | "optional";
  fixedBaseUrl?: string;
  fields: CredentialField[];
  installState?: IntegrationInstallState;
  authModes?: string[];
  requiredScopes?: string[];
  supportsWebhooks?: boolean;
  healthChecks?: string[];
  testImport?: {
    mode: "fixture" | "probe" | "live";
    supported: boolean;
    notes: string[];
  };
  limitations?: string[];
};

const labelClass = "grid gap-1.5 text-sm font-medium text-[var(--text-body)]";
const fieldClass = "form-control h-10 w-full text-sm";

const STEP_LABELS: Record<string, string> = {
  validate_url: "Адрес проверен",
  reachability: "Сервер отвечает",
  auto_detect: "Автоопределение",
  verify_auth: "Авторизация",
  capability_probe: "Права и лимиты",
  webhook_probe: "Webhook",
  persist: "Источник подключён",
  test_import: "Пробный импорт",
  certification_evidence: "Evidence сертификации"
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

const INSTALL_STATE_LABELS: Partial<Record<IntegrationInstallState, string>> = {
  "token-only": "токен",
  limited: "ограниченно",
  "oauth-ready": "OAuth",
  "webhook-ready": "webhook",
  "live-certified": "live"
};

const AUTH_MODE_LABELS: Record<string, string> = {
  basic: "basic-доступ",
  basic_api_token: "API-токен",
  basic_api_key: "API-ключ",
  bearer_token: "bearer-токен",
  private_app_token: "токен приложения",
  oauth: "OAuth",
  oauth_connected_app: "OAuth-приложение",
  oauth_token: "OAuth-токен",
  static_credentials: "статические доступы",
  session_create: "сессия",
  tls_ca_bundle: "TLS CA",
  user_password: "логин/пароль"
};

function sourceMeta(item: ConnectSourceItem) {
  return sourceLogoMeta(item.source, item.label);
}

function shouldDiscloseInstallState(item: ConnectSourceItem) {
  return item.installState === "token-only" || item.installState === "limited";
}

function installStateLabel(item: ConnectSourceItem) {
  return item.installState ? INSTALL_STATE_LABELS[item.installState] : undefined;
}

function formatAuthModes(authModes: string[] | undefined) {
  if (!authModes || authModes.length === 0) {
    return null;
  }

  return authModes.map((authMode) => AUTH_MODE_LABELS[authMode] ?? authMode).join(", ");
}

function displayLimitation(limitation: string | undefined) {
  if (!limitation) {
    return undefined;
  }

  if (limitation === "Доступ настраивается через существующий token/basic credential flow.") {
    return "Доступ: вручную через токен или basic-учётные данные.";
  }

  if (limitation === "Доступ настраивается через существующий credential/token flow.") {
    return "Доступ: вручную через учётные данные или токен.";
  }

  return limitation;
}

function shortList(items: string[] | undefined, fallback: string) {
  if (!items || items.length === 0) {
    return fallback;
  }

  return items.slice(0, 3).join(", ");
}

function testImportLabel(item: ConnectSourceItem) {
  if (!item.testImport) {
    return "Пробный импорт уточняется после проверки доступа.";
  }

  if (!item.testImport.supported) {
    return "Пробный импорт недоступен: сначала contract/live certification.";
  }

  const modeLabel = {
    fixture: "fixture",
    probe: "probe",
    live: "live"
  }[item.testImport.mode];

  return `Пробный импорт: ${modeLabel}${item.testImport.notes[0] ? ` · ${item.testImport.notes[0]}` : ""}`;
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
  const nextAction = steps.length > 0 ? nextActionForConnectSteps(steps) : null;
  const fallbackOpen = steps.some(
    (step) => step.status === "failed" && MANUAL_FIXABLE_STEPS.has(step.step)
  );
  const connected = hasSteps(state) && state.connected;

  return (
    <section className="panel overflow-clip">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-lg font-semibold">Подключение источника</h2>
        <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
          Укажите адрес и доступы. Stemma проверит права, сохранит источник и подготовит пробный импорт.
        </p>
      </div>

      <div className="connect-source-guidance connect-source-guidance--route mx-5 mt-4" aria-label="Маршрут подключения источника">
        <div className="connect-source-guidance__lead">
          <p className="page-kicker">Маршрут подключения</p>
          <h3>Выбор → доступы → безопасная проверка</h3>
          <p>Сначала выберите источник, затем проверьте обязательные доступы и только после этого запускайте preview/import.</p>
        </div>
        <div className="connect-source-guidance__items">
          <div>
            <span>1. Источник</span>
            <strong>Выбрать профиль</strong>
            <small>Карточки показывают install state и ограничения.</small>
          </div>
          <div>
            <span>2. Доступы</span>
            <strong>URL и секреты</strong>
            <small>Raw секреты не отображаются после сохранения.</small>
          </div>
          <div>
            <span>3. Проверка</span>
            <strong>Диагностика и пробный запуск</strong>
            <small>Live-сертификация требует доказательства перед рабочим режимом.</small>
          </div>
        </div>
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
                  const stateLabel = installStateLabel(item);
                  const firstLimitation = shouldDiscloseInstallState(item) ? displayLimitation(item.limitations?.[0]) : undefined;

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
                          {stateLabel && shouldDiscloseInstallState(item) ? (
                            <span className="connect-source-card__flag">{stateLabel}</span>
                          ) : null}
                        </span>
                        <span className="connect-source-card__hint">{meta.hint}</span>
                        {firstLimitation ? (
                          <span className="connect-source-card__hint" title={firstLimitation}>
                            {firstLimitation}
                          </span>
                        ) : null}
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
              {shouldDiscloseInstallState(selected) ? (
                <span>
                  {installStateLabel(selected)}
                  {formatAuthModes(selected.authModes) ? ` · ${formatAuthModes(selected.authModes)}` : ""}
                </span>
              ) : null}
              {shouldDiscloseInstallState(selected) && selected.limitations?.[0] ? (
                <span>{displayLimitation(selected.limitations[0])}</span>
              ) : null}
            </span>
          </div>

          <div className="connect-source-guidance" aria-label="Что подготовить для подключения">
            <div className="connect-source-guidance__lead">
              <p className="page-kicker">Что подготовить</p>
              <h3>{selected.label}</h3>
              <p>{selected.supportsWebhooks ? "Есть контур действий и вебхуков; рабочую готовность подтвердят доказательства." : "Основной контур: доступы, проверки здоровья и безопасный пробный импорт."}</p>
            </div>
            <div className="connect-source-guidance__items">
              <div>
                <span>Доступ</span>
                <strong>{formatAuthModes(selected.authModes) ?? "уточнить вручную"}</strong>
                <small>{selected.requiredScopes && selected.requiredScopes.length > 0 ? `Права: ${shortList(selected.requiredScopes, "не требуются")}` : "Отдельные права не требуются или задаются в токене."}</small>
              </div>
              <div>
                <span>Проверки</span>
                <strong>{shortList(selected.healthChecks, "health check после авторизации")}</strong>
                <small>{selected.supportsWebhooks ? "Webhook probe входит в маршрут." : "Webhook не заявлен в контракте."}</small>
              </div>
              <div>
                <span>Импорт</span>
                <strong>{selected.testImport?.supported ? "Можно запустить" : "Ограничен"}</strong>
                <small>{testImportLabel(selected)}</small>
              </div>
            </div>
            {selected.limitations && selected.limitations.length > 0 ? (
              <ul className="connect-source-guidance__limitations">
                {selected.limitations.slice(0, 3).map((limitation) => (
                  <li key={limitation}>{displayLimitation(limitation)}</li>
                ))}
              </ul>
            ) : null}
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
          {nextAction ? (
            <div className={`connect-next-action connect-next-action--${nextAction.severity}`}>
              <strong>{nextAction.label}</strong>
              <span>{nextAction.description}</span>
            </div>
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
