"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { RequiredMark } from "@/components/ui/required-mark";
import { saveIntegrationConfigurationState, type IntegrationActionState } from "@/lib/integration-actions";

const initialState: IntegrationActionState = null;

/** Строка таблицы/деталки источника — только то, что нужно форме настроек. */
export type IntegrationSettingsFormIntegration = {
  source: string;
  displayName: string;
  type: string;
  baseUrl: string | null;
  importLimit: number;
  batchSize: number;
  dateRangeDays: number;
  configJson: string;
};

const labelClass = "grid gap-1 text-sm font-medium text-[var(--text-body)]";

/**
 * readIntegrationSetup читает секрет из поля, имя которого зависит от mode:
 * password (otrs_family) / nativeToken (native_helpdesk) / dataSourceSecret
 * (data_source). У custom_api секрета нет — поле не рендерим.
 */
function secretFieldNameForMode(mode: string) {
  if (mode === "otrs_family") {
    return "password";
  }

  if (mode === "native_helpdesk") {
    return "nativeToken";
  }

  if (mode === "data_source") {
    return "dataSourceSecret";
  }

  return null;
}

type WizardConfig = {
  ticketId: string;
  userLogin: string;
  queueFilter: string;
  statusFilter: string;
  dryRun: boolean;
  deduplicate: boolean;
};

/**
 * readIntegrationSetup собирает config заново из полей формы, поэтому текущие
 * значения мастера (логин, фильтры, режимы) прокидываем hidden-полями — иначе
 * сохранение настроек затерло бы их. tablePath/query для data_source читаются
 * из hidden configJson (fallback в readIntegrationSetup).
 */
function readWizardConfig(configJson: string): WizardConfig {
  const fallback: WizardConfig = {
    ticketId: "",
    userLogin: "",
    queueFilter: "",
    statusFilter: "",
    dryRun: true,
    deduplicate: true
  };

  let parsed: unknown;

  try {
    parsed = JSON.parse(configJson);
  } catch {
    return fallback;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fallback;
  }

  const config = parsed as Record<string, unknown>;
  const filters =
    config.filters && typeof config.filters === "object" && !Array.isArray(config.filters)
      ? (config.filters as Record<string, unknown>)
      : {};

  return {
    ticketId: typeof config.ticketId === "string" ? config.ticketId : "",
    userLogin: typeof config.userLogin === "string" ? config.userLogin : "",
    queueFilter: typeof filters.queue === "string" ? filters.queue : "",
    statusFilter: typeof filters.status === "string" ? filters.status : "",
    dryRun: typeof config.dryRun === "boolean" ? config.dryRun : fallback.dryRun,
    deduplicate: typeof config.deduplicate === "boolean" ? config.deduplicate : fallback.deduplicate
  };
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="action-button action-button--primary" disabled={pending}>
      {pending ? "Сохраняем..." : "Сохранить настройки"}
    </button>
  );
}

export function IntegrationSettingsForm({ integration }: { integration: IntegrationSettingsFormIntegration }) {
  const [state, formAction] = useActionState(saveIntegrationConfigurationState, initialState);
  const mode = integration.type?.trim() || "custom_api";
  const secretFieldName = secretFieldNameForMode(mode);
  const wizardConfig = readWizardConfig(integration.configJson);

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="source" value={integration.source} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="configJson" value={integration.configJson} />
      <input type="hidden" name="ticketId" value={wizardConfig.ticketId} />
      <input type="hidden" name="userLogin" value={wizardConfig.userLogin} />
      <input type="hidden" name="queueFilter" value={wizardConfig.queueFilter} />
      <input type="hidden" name="statusFilter" value={wizardConfig.statusFilter} />
      <input type="hidden" name="dryRun" value={String(wizardConfig.dryRun)} />
      <input type="hidden" name="deduplicate" value={String(wizardConfig.deduplicate)} />

      <label className={labelClass}>
        <span>
          Название
          <RequiredMark />
        </span>
        <input name="sourceLabel" required minLength={1} maxLength={120} defaultValue={integration.displayName} className="form-control" />
      </label>

      <label className={labelClass}>
        <span>
          Base URL
          {mode !== "custom_api" ? <RequiredMark /> : null}
        </span>
        <input
          name="baseUrl"
          type="url"
          required={mode !== "custom_api"}
          defaultValue={integration.baseUrl ?? ""}
          placeholder="https://example.zendesk.com"
          className="form-control"
        />
      </label>

      <div className="form-group">
        <p className="form-group__label">Лимиты импорта</p>
        <div className="form-group__body form-group__body--grid">
          <label className={labelClass}>
            Лимит импорта
            <input
              name="maxTickets"
              type="number"
              min="1"
              max="10000"
              defaultValue={integration.importLimit}
              className="form-control tabular-nums"
            />
          </label>
          <label className={labelClass}>
            Размер пачки
            <input
              name="batchSize"
              type="number"
              min="1"
              max="1000"
              defaultValue={integration.batchSize}
              className="form-control tabular-nums"
            />
          </label>
          <label className={labelClass}>
            Глубина, дней
            <input
              name="dateRangeDays"
              type="number"
              min="1"
              max="3650"
              defaultValue={integration.dateRangeDays}
              className="form-control tabular-nums"
            />
          </label>
        </div>
      </div>

      {secretFieldName ? (
        <label className={labelClass}>
          Ключ/токен
          <input name={secretFieldName} type="password" autoComplete="new-password" className="form-control" />
          <span className="text-xs font-normal text-[var(--text-muted)]">
            Оставьте пустым, чтобы не менять сохранённый ключ.
          </span>
        </label>
      ) : null}

      <div className="flex justify-end">
        <SubmitButton />
      </div>

      {state ? (
        <p className={`text-sm font-medium ${state.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{state.message}</p>
      ) : null}
    </form>
  );
}
