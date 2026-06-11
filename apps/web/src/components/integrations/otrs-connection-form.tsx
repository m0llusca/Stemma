"use client";

import { Save } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { type OtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import { otrsFamilyProfiles } from "@/lib/integrations/otrs-family/profiles";
import { saveOtrsIntegrationConfigurationState, type IntegrationActionState } from "@/lib/integration-actions";
import { detectOtrsRoutesAction, type DetectOtrsRoutesState } from "@/lib/otrs-import-actions";

const initialState: IntegrationActionState = null;
const labelClass = "grid gap-1.5 text-sm font-medium text-[var(--text-body)]";
const fieldClass = "form-control h-10 w-full text-sm";
const textareaClass = "form-control min-h-[110px] w-full resize-y text-sm";

const OTRS_TIME_ZONES = [
  "UTC",
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Asia/Yekaterinburg",
  "Asia/Novosibirsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Vladivostok"
] as const;

type CredentialSummary = {
  id: string;
  kind: string;
  authMode: string;
  fingerprint: string | null;
  lastRotatedAt: string | null;
};

type OtrsConnectionFormProps = {
  integration: {
    id: string;
    source: string;
    displayName: string;
    baseUrl: string | null;
    importLimit: number;
    batchSize: number;
    dateRangeDays: number;
  };
  config: OtrsConnectorConfig;
  userLogin: string;
  credentials: CredentialSummary[];
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="action-button action-button--primary" disabled={pending}>
      <Save size={16} aria-hidden="true" />
      {pending ? "Сохраняем" : "Сохранить OTRS"}
    </button>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("ru-RU") : "Нет данных";
}

function routeConfigJson(
  config: OtrsConnectorConfig,
  routes: {
    ticketSearchPath: string;
    ticketGetPath: string;
    ticketSearchMethod: "GET" | "POST";
    ticketGetMethod: "GET" | "POST";
  },
  routeOverridesEnabled: boolean,
  auth: OtrsConnectorConfig["auth"],
  timeZone: string
) {
  return JSON.stringify({
    auth,
    timeZone,
    articlePolicy: config.articlePolicy,
    attachmentPolicy: config.attachmentPolicy,
    advanced: {
      ...config.advanced,
      routeOverridesEnabled
    },
    ...(routeOverridesEnabled ? { routes } : {})
  });
}

export function OtrsConnectionForm({ integration, config, userLogin, credentials }: OtrsConnectionFormProps) {
  const [state, formAction] = useActionState(saveOtrsIntegrationConfigurationState, initialState);
  const [detectState, detectAction, detecting] = useActionState<DetectOtrsRoutesState, FormData>(
    detectOtrsRoutesAction,
    null
  );
  const [webServiceName, setWebServiceName] = useState(config.webServiceName);
  const [timeZone, setTimeZone] = useState(config.timeZone ?? "UTC");
  const [routeOverridesEnabled, setRouteOverridesEnabled] = useState(config.advanced.routeOverridesEnabled);
  const [ticketSearchMethod, setTicketSearchMethod] = useState<"GET" | "POST">(config.routes.ticketSearchMethod);
  const [ticketGetMethod, setTicketGetMethod] = useState<"GET" | "POST">(config.routes.ticketGetMethod);
  const [ticketSearchPath, setTicketSearchPath] = useState(config.routes.ticketSearchPath);
  const [ticketGetPath, setTicketGetPath] = useState(config.routes.ticketGetPath);
  const [ticketSearchAuth, setTicketSearchAuth] = useState<"credentials" | "session">(config.auth.ticketSearch);
  const [ticketGetAuth, setTicketGetAuth] = useState<"credentials" | "session">(config.auth.ticketGet);
  const [sessionCreatePath, setSessionCreatePath] = useState(config.auth.sessionCreatePath);

  useEffect(() => {
    if (detectState?.ok) {
      const { ticketGet, ticketSearch } = detectState.result;
      if (ticketGet) {
        setTicketGetMethod(ticketGet.method);
        setTicketGetPath(ticketGet.path);
      }
      if (ticketSearch) {
        setTicketSearchMethod(ticketSearch.method);
        setTicketSearchPath(ticketSearch.path);
      }
      if (ticketGet || ticketSearch) {
        setRouteOverridesEnabled(true);
      }
    }
  }, [detectState]);
  const products = Object.values(otrsFamilyProfiles);
  const credentialByKind = useMemo(() => new Map(credentials.map((credential) => [credential.kind, credential])), [credentials]);
  const passwordSlot = credentialByKind.get("auth_password");
  const caSlot = credentialByKind.get("ca_bundle");
  const defaultUserLogin = userLogin || "agent_login";
  const routes = {
    ticketSearchPath,
    ticketGetPath,
    ticketSearchMethod,
    ticketGetMethod
  };
  const auth = {
    ...config.auth,
    ticketSearch: ticketSearchAuth,
    ticketGet: ticketGetAuth,
    sessionCreatePath,
    sessionCreateMethod: "POST" as const
  };

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-lg font-semibold">Настройка подключения</h2>
        <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
          Секреты вводятся только для обновления. Сохраненные пароль и CA PEM не отображаются обратно в UI.
        </p>
      </div>

      <form action={detectAction} className="grid gap-2 border-b border-[var(--border)] px-4 py-4">
        <input type="hidden" name="baseUrl" value={integration.baseUrl ?? ""} />
        <input type="hidden" name="webServiceName" value={webServiceName} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="action-button" disabled={detecting}>
            {detecting ? "Определяем..." : "Определить маршруты автоматически"}
          </button>
          <span className="text-xs text-[var(--text-muted)]">
            Пробует стандартные маршруты GenericInterface и заполняет route overrides.
          </span>
        </div>
        {detectState?.ok === false ? (
          <p className="text-sm font-medium text-[var(--danger)]">{detectState.message}</p>
        ) : null}
        {detectState?.ok && detectState.result.undetected.length > 0 ? (
          <p className="text-sm text-[var(--warning)]">
            Не определены: {detectState.result.undetected.join(", ")} — введите вручную.
          </p>
        ) : null}
      </form>

      <form action={formAction} className="grid gap-5 p-4">
        <input type="hidden" name="source" value={integration.source} />
        <input type="hidden" name="configJson" value={routeConfigJson(config, routes, routeOverridesEnabled, auth, timeZone)} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            Название
            <input name="displayName" defaultValue={integration.displayName} required className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            Product profile
            <select name="product" defaultValue={config.product} className={fieldClass}>
              {products.map((product) => (
                <option key={product.product} value={product.product}>
                  {product.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            Base URL
            <input name="baseUrl" defaultValue={integration.baseUrl ?? ""} required className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            WebService name
            <input
              name="webServiceName"
              value={webServiceName}
              onChange={(event) => setWebServiceName(event.target.value)}
              required
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            Таймзона OTRS-сервера
            <select
              name="timeZone"
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              className={fieldClass}
            >
              {OTRS_TIME_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            Base path
            <input name="basePath" defaultValue={config.basePath} required className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            UserLogin
            <input name="userLogin" defaultValue={defaultUserLogin} required className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            Пароль или API-секрет
            <input name="password" type="password" autoComplete="new-password" className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            Search limit
            <input name="searchLimit" type="number" min="1" max="100" defaultValue={config.limits.searchLimit} className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            Manual TicketID limit
            <input
              name="manualTicketIdLimit"
              type="number"
              min="1"
              max="50"
              defaultValue={config.limits.manualTicketIdLimit}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            Import limit
            <input name="importLimit" type="number" min="1" max="100" defaultValue={integration.importLimit} className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            Размер батча
            <input name="batchSize" type="number" min="1" max="50" defaultValue={integration.batchSize} className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            Период, дней
            <input name="dateRangeDays" type="number" min="1" max="365" defaultValue={integration.dateRangeDays} className={fieldClass} />
          </label>
        </div>

        <div className="soft-callout grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            SessionCreate path
            <input
              value={sessionCreatePath}
              onChange={(event) => setSessionCreatePath(event.target.value)}
              placeholder="/Session"
              className={`${fieldClass} font-mono text-xs`}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            TicketSearch auth
            <select
              value={ticketSearchAuth}
              onChange={(event) => setTicketSearchAuth(event.target.value as "credentials" | "session")}
              className={fieldClass}
            >
              <option value="credentials">UserLogin + Password</option>
              <option value="session">SessionCreate + SessionID</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            TicketGet auth
            <select
              value={ticketGetAuth}
              onChange={(event) => setTicketGetAuth(event.target.value as "credentials" | "session")}
              className={fieldClass}
            >
              <option value="credentials">UserLogin + Password</option>
              <option value="session">SessionCreate + SessionID</option>
            </select>
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
            CA bundle PEM
            <textarea name="caBundle" rows={5} spellCheck={false} className={textareaClass} />
          </label>
          <div className="grid content-start gap-2">
            <div className="soft-callout">
              <p className="soft-callout__label">Password slot</p>
              <p className="record-title record-title--tight">{passwordSlot ? "Сохранен" : "Не сохранен"}</p>
              <p className="record-meta">Ротация: {formatDate(passwordSlot?.lastRotatedAt ?? null)}</p>
            </div>
            <div className="soft-callout">
              <p className="soft-callout__label">CA bundle slot</p>
              <p className="record-title record-title--tight">{caSlot ? "Сохранен" : "Не сохранен"}</p>
              <p className="record-meta compact-text">
                Fingerprint: {caSlot?.fingerprint ? caSlot.fingerprint.slice(0, 16) : "нет"}
              </p>
            </div>
          </div>
        </div>

        <details className="compact-details disclosure-panel overflow-hidden">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[var(--text-body)]">
            Advanced route overrides
          </summary>
          <div className="grid gap-4 border-t border-[var(--border)] p-4">
            <label className="soft-callout grid-cols-[auto_minmax(0,1fr)] items-start text-sm text-[var(--text-body)]">
              <input
                type="checkbox"
                checked={routeOverridesEnabled}
                onChange={(event) => setRouteOverridesEnabled(event.target.checked)}
                className="mt-1"
              />
              <span>
                Включить route overrides. Используйте только если GenericInterface WebService создан с нестандартными маршрутами.
              </span>
            </label>
            <div className="grid gap-3 xl:grid-cols-2">
              <fieldset className="soft-callout grid gap-3">
                <legend className="soft-callout__label">TicketSearch route</legend>
                <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                  <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                    Method
                    <select
                      value={ticketSearchMethod}
                      onChange={(event) => setTicketSearchMethod(event.target.value as "GET" | "POST")}
                      disabled={!routeOverridesEnabled}
                      className={fieldClass}
                    >
                      <option value="POST">POST</option>
                      <option value="GET">GET</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                    Path
                    <input
                      value={ticketSearchPath}
                      onChange={(event) => setTicketSearchPath(event.target.value)}
                      disabled={!routeOverridesEnabled}
                      placeholder="/Ticket/Search"
                      className={`${fieldClass} font-mono text-xs`}
                    />
                  </label>
                </div>
              </fieldset>
              <fieldset className="soft-callout grid gap-3">
                <legend className="soft-callout__label">TicketGet route</legend>
                <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                  <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                    Method
                    <select
                      value={ticketGetMethod}
                      onChange={(event) => setTicketGetMethod(event.target.value as "GET" | "POST")}
                      disabled={!routeOverridesEnabled}
                      className={fieldClass}
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                    Path
                    <input
                      value={ticketGetPath}
                      onChange={(event) => setTicketGetPath(event.target.value)}
                      disabled={!routeOverridesEnabled}
                      placeholder="/Ticket/{TicketID}"
                      className={`${fieldClass} font-mono text-xs`}
                    />
                  </label>
                </div>
              </fieldset>
            </div>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton />
          {state ? (
            <p className={`text-sm font-medium ${state.ok ? "text-[#166534]" : "text-[var(--danger)]"}`}>{state.message}</p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
