"use client";

import { Save } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { type OtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import { otrsFamilyProfiles } from "@/lib/integrations/otrs-family/profiles";
import { saveOtrsIntegrationConfigurationState, type IntegrationActionState } from "@/lib/integration-actions";

const initialState: IntegrationActionState = null;
const fieldClass = "form-control h-10 w-full text-sm";
const textareaClass = "form-control min-h-[110px] w-full resize-y text-sm";

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
  routeOverridesEnabled: boolean
) {
  return JSON.stringify({
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
  const [routeOverridesEnabled, setRouteOverridesEnabled] = useState(config.advanced.routeOverridesEnabled);
  const [ticketSearchMethod, setTicketSearchMethod] = useState<"GET" | "POST">(config.routes.ticketSearchMethod);
  const [ticketGetMethod, setTicketGetMethod] = useState<"GET" | "POST">(config.routes.ticketGetMethod);
  const [ticketSearchPath, setTicketSearchPath] = useState(config.routes.ticketSearchPath);
  const [ticketGetPath, setTicketGetPath] = useState(config.routes.ticketGetPath);
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

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[#d9e0ea] px-5 py-4">
        <h2 className="text-lg font-semibold">Настройка подключения</h2>
        <p className="mt-1 text-sm leading-5 text-[#64748b]">
          Секреты вводятся только для обновления. Сохраненные пароль и CA PEM не отображаются обратно в UI.
        </p>
      </div>

      <form action={formAction} className="grid gap-5 p-4">
        <input type="hidden" name="source" value={integration.source} />
        <input type="hidden" name="configJson" value={routeConfigJson(config, routes, routeOverridesEnabled)} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
            Название
            <input name="displayName" defaultValue={integration.displayName} required className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
            Product profile
            <select name="product" defaultValue={config.product} className={fieldClass}>
              {products.map((product) => (
                <option key={product.product} value={product.product}>
                  {product.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
            Base URL
            <input name="baseUrl" defaultValue={integration.baseUrl ?? ""} required className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
            WebService name
            <input name="webServiceName" defaultValue={config.webServiceName} required className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
            Base path
            <input name="basePath" defaultValue={config.basePath} required className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
            UserLogin
            <input name="userLogin" defaultValue={defaultUserLogin} required className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
            Пароль или API-секрет
            <input name="password" type="password" autoComplete="new-password" className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
            Search limit
            <input name="searchLimit" type="number" min="1" max="100" defaultValue={config.limits.searchLimit} className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
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
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
            Import limit
            <input name="importLimit" type="number" min="1" max="100" defaultValue={integration.importLimit} className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
            Размер батча
            <input name="batchSize" type="number" min="1" max="50" defaultValue={integration.batchSize} className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
            Период, дней
            <input name="dateRangeDays" type="number" min="1" max="365" defaultValue={integration.dateRangeDays} className={fieldClass} />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
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
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#334155]">
            Advanced route overrides
          </summary>
          <div className="grid gap-4 border-t border-[#d9e0ea] p-4">
            <label className="soft-callout grid-cols-[auto_minmax(0,1fr)] items-start text-sm text-[#334155]">
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
                  <label className="grid gap-1 text-sm font-medium text-[#334155]">
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
                  <label className="grid gap-1 text-sm font-medium text-[#334155]">
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
                  <label className="grid gap-1 text-sm font-medium text-[#334155]">
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
                  <label className="grid gap-1 text-sm font-medium text-[#334155]">
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
            <p className={`text-sm font-medium ${state.ok ? "text-[#166534]" : "text-[#b91c1c]"}`}>{state.message}</p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
