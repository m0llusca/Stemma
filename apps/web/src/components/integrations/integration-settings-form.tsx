"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
    <Button type="submit" disabled={pending}>
      {pending ? "Сохраняем..." : "Сохранить настройки"}
    </Button>
  );
}

export function IntegrationSettingsForm({ integration }: { integration: IntegrationSettingsFormIntegration }) {
  const [state, formAction] = useActionState(saveIntegrationConfigurationState, initialState);
  const mode = integration.type?.trim() || "custom_api";
  const secretFieldName = secretFieldNameForMode(mode);
  const wizardConfig = readWizardConfig(integration.configJson);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="source" value={integration.source} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="configJson" value={integration.configJson} />
      <input type="hidden" name="ticketId" value={wizardConfig.ticketId} />
      <input type="hidden" name="userLogin" value={wizardConfig.userLogin} />
      <input type="hidden" name="queueFilter" value={wizardConfig.queueFilter} />
      <input type="hidden" name="statusFilter" value={wizardConfig.statusFilter} />
      <input type="hidden" name="dryRun" value={String(wizardConfig.dryRun)} />
      <input type="hidden" name="deduplicate" value={String(wizardConfig.deduplicate)} />

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="settings-sourceLabel">
            Название
            <RequiredMark />
          </FieldLabel>
          <Input
            id="settings-sourceLabel"
            name="sourceLabel"
            required
            minLength={1}
            maxLength={120}
            defaultValue={integration.displayName}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="settings-baseUrl">
            Base URL
            {mode !== "custom_api" ? <RequiredMark /> : null}
          </FieldLabel>
          <Input
            id="settings-baseUrl"
            name="baseUrl"
            type="url"
            required={mode !== "custom_api"}
            defaultValue={integration.baseUrl ?? ""}
            placeholder="https://example.zendesk.com"
          />
        </Field>

        <FieldGroup className="gap-3">
          <FieldDescription className="text-sm font-medium text-foreground">Лимиты импорта</FieldDescription>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="settings-maxTickets">Лимит импорта</FieldLabel>
              <Input
                id="settings-maxTickets"
                name="maxTickets"
                type="number"
                min={1}
                max={10000}
                defaultValue={integration.importLimit}
                className="tabular-nums"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-batchSize">Размер пачки</FieldLabel>
              <Input
                id="settings-batchSize"
                name="batchSize"
                type="number"
                min={1}
                max={1000}
                defaultValue={integration.batchSize}
                className="tabular-nums"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-dateRangeDays">Глубина, дней</FieldLabel>
              <Input
                id="settings-dateRangeDays"
                name="dateRangeDays"
                type="number"
                min={1}
                max={3650}
                defaultValue={integration.dateRangeDays}
                className="tabular-nums"
              />
            </Field>
          </div>
        </FieldGroup>

        {secretFieldName ? (
          <Field>
            <FieldLabel htmlFor="settings-secret">Ключ/токен</FieldLabel>
            <Input id="settings-secret" name={secretFieldName} type="password" autoComplete="new-password" />
            <FieldDescription>Оставьте пустым, чтобы не менять сохранённый ключ.</FieldDescription>
          </Field>
        ) : null}
      </FieldGroup>

      <div className="flex justify-end gap-2">
        <SubmitButton />
      </div>

      {state ? (
        <Alert variant={state.ok ? "default" : "destructive"}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
