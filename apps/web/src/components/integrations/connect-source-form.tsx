"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Check, ChevronDown, Info } from "lucide-react";
import { ActionFlowGuard } from "@/components/action-flow-guard";
import { SourceLogoMark, sourceLogoMeta } from "@/components/integrations/source-logo-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { connectSourceAction, type ConnectJournalState } from "@/lib/connect-actions";
import { capabilityMatrixFromConnectSteps } from "@/lib/integrations/connect/capability-probe-display";
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

const STEP_LABELS: Record<string, string> = {
  validate_url: "Адрес проверен",
  reachability: "Сервер отвечает",
  auto_detect: "Автоопределение",
  verify_auth: "Авторизация",
  capability_probe: "Права и лимиты",
  webhook_probe: "Webhook",
  persist: "Источник сохранён после проверки",
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
  // Diagnostic/probe ok is informational — reserve production-green for live cert only.
  ok: "text-primary",
  warning: "text-amber-600 dark:text-amber-400",
  failed: "text-destructive",
  skipped: "text-muted-foreground"
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
    return "Пробный импорт недоступен: сначала нужна проверка контракта и живая сертификация.";
  }

  const modeLabel = {
    fixture: "fixture",
    probe: "пробный запрос",
    live: "живой"
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
    <Button type="submit" disabled={pending}>
      {pending ? "Проверяем..." : "Проверить и подключить"}
    </Button>
  );
}

function GuidanceCard({
  kicker,
  title,
  description,
  items,
  limitations
}: {
  kicker: string;
  title: string;
  description: string;
  items: Array<{ label: string; value: string; hint: string }>;
  limitations?: string[];
}) {
  return (
    <Card size="sm" className="bg-muted/40 ring-foreground/5">
      <CardHeader className="gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kicker}</p>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.label} className="grid gap-1 border-t border-border pt-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {item.label}
              </span>
              <strong className="text-sm font-semibold text-foreground">{item.value}</strong>
              <small className="text-xs leading-snug text-muted-foreground">{item.hint}</small>
            </div>
          ))}
        </div>
        {limitations && limitations.length > 0 ? (
          <ul className="grid list-disc gap-1 pl-4 text-xs text-muted-foreground">
            {limitations.map((limitation) => (
              <li key={limitation}>{displayLimitation(limitation)}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ConnectSourceForm({
  sources,
  initialState
}: {
  sources: ConnectSourceItem[];
  initialState?: ConnectJournalState;
}) {
  const [actionState, formAction] = useActionState(connectSourceAction, initialState ?? null);
  // The bridged journal feeds the result UI when the client router drops the
  // action commit (Next 16.2.x); the healthy path is untouched.
  const [bridgedState, setBridgedState] = useState<ConnectJournalState>(null);
  const state = bridgedState ?? actionState;
  const [selectedSource, setSelectedSource] = useState<string | null>(
    sources.length === 1 ? sources[0].source : null
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
  const capabilityMatrix = capabilityMatrixFromConnectSteps(steps);
  const fallbackOpen = steps.some(
    (step) => step.status === "failed" && MANUAL_FIXABLE_STEPS.has(step.step)
  );
  const connected = hasSteps(state) && state.connected;
  const detailsOpen = advancedOpen || fallbackOpen;

  return (
    <Card className="overflow-clip">
      <CardHeader className="border-b">
        <h2 className="font-heading text-lg leading-snug font-medium">
          Подключение источника
        </h2>
        <CardDescription>
          Укажите адрес и доступы. Stemma сначала проверит доступ (probe), и только при успехе сохранит
          источник. Зелёный production-ready — только после живой сертификации.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4 pt-4">
        <GuidanceCard
          kicker="Маршрут подключения"
          title="Выбор → доступы → безопасная проверка"
          description="Сначала выберите источник, затем проверьте обязательные доступы и только после этого запускайте предпросмотр или импорт."
          items={[
            {
              label: "1. Источник",
              value: "Выбрать профиль",
              hint: "Карточки показывают статус установки и ограничения."
            },
            {
              label: "2. Доступы",
              value: "URL и секреты",
              hint: "Секреты write-only: после сохранения в UI не возвращаются."
            },
            {
              label: "3. Проверка",
              value: "Probe до сохранения",
              hint: "Живая сертификация — отдельный шаг с evidence; stub ≠ production."
            }
          ]}
        />

        {sources.length > 0 ? (
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="connect-source-select">Источник</FieldLabel>
              <Select
                value={selectedSource}
                onValueChange={(value) => {
                  if (value != null) {
                    setSelectedSource(value);
                  }
                }}
              >
                <SelectTrigger id="connect-source-select" className="w-full min-w-0" size="default">
                  <SelectValue placeholder="Выберите тип источника" />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false} className="min-w-[var(--anchor-width)]">
                  {groups.map((group) => (
                    <SelectGroup key={group.type}>
                      <SelectLabel>{group.title}</SelectLabel>
                      {group.items.map((item) => (
                        <SelectItem key={item.source} value={item.source}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Или выберите карточку ниже — список синхронизирован с селектом.</FieldDescription>
            </Field>

            <div className="grid gap-4">
              {groups.map((group) => (
                <div key={group.type} className="grid gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.title}
                  </p>
                  <div
                    className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-2"
                    role="radiogroup"
                    aria-label={group.title}
                  >
                    {group.items.map((item) => {
                      const isActive = item.source === selectedSource;
                      const meta = sourceMeta(item);
                      const stateLabel = installStateLabel(item);
                      const firstLimitation = shouldDiscloseInstallState(item)
                        ? displayLimitation(item.limitations?.[0])
                        : undefined;

                      return (
                        <Button
                          key={item.source}
                          type="button"
                          variant="outline"
                          role="radio"
                          aria-checked={isActive}
                          onClick={() => setSelectedSource(item.source)}
                          className={cn(
                            "h-auto min-w-0 justify-start gap-2.5 px-3 py-2.5 text-left whitespace-normal",
                            isActive && "border-primary bg-primary/5 ring-1 ring-primary/30"
                          )}
                        >
                          <SourceLogoMark meta={meta} />
                          <span className="grid min-w-0 flex-1 gap-0.5">
                            <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
                              {item.label}
                              {stateLabel && shouldDiscloseInstallState(item) ? (
                                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                  {stateLabel}
                                </Badge>
                              ) : null}
                            </span>
                            <span className="truncate text-xs font-normal text-muted-foreground" title={meta.hint}>
                              {meta.hint}
                            </span>
                            {firstLimitation ? (
                              <span className="truncate text-xs font-normal text-muted-foreground" title={firstLimitation}>
                                {firstLimitation}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={cn(
                              "inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-colors",
                              isActive ? "bg-primary text-primary-foreground" : "text-transparent"
                            )}
                            aria-hidden="true"
                          >
                            <Check size={14} />
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </FieldGroup>
        ) : null}

        {selected ? (
          <form action={formAction} className="grid gap-4">
            <ActionFlowGuard
              onResult={(value) => {
                const result = value as ConnectJournalState;
                if (result) setBridgedState(result);
              }}
            />
            <input type="hidden" name="source" value={selected.source} />

            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/50 px-3 py-2" aria-live="polite">
              <SourceLogoMark meta={sourceMeta(selected)} />
              <span className="grid min-w-0 gap-0.5">
                <strong className="text-sm font-semibold text-foreground">{selected.label}</strong>
                <span className="text-xs text-muted-foreground">{sourceMeta(selected).hint}</span>
                {shouldDiscloseInstallState(selected) ? (
                  <span className="text-xs text-muted-foreground">
                    {installStateLabel(selected)}
                    {formatAuthModes(selected.authModes) ? ` · ${formatAuthModes(selected.authModes)}` : ""}
                  </span>
                ) : null}
                {shouldDiscloseInstallState(selected) && selected.limitations?.[0] ? (
                  <span className="text-xs text-muted-foreground">{displayLimitation(selected.limitations[0])}</span>
                ) : null}
              </span>
            </div>

            <GuidanceCard
              kicker="Что подготовить"
              title={selected.label}
              description={
                selected.supportsWebhooks
                  ? "Есть контур действий и вебхуков; рабочую готовность подтвердят доказательства."
                  : "Основной контур: доступы, проверки здоровья и безопасный пробный импорт."
              }
              items={[
                {
                  label: "Доступ",
                  value: formatAuthModes(selected.authModes) ?? "уточнить вручную",
                  hint:
                    selected.requiredScopes && selected.requiredScopes.length > 0
                      ? `Права: ${shortList(selected.requiredScopes, "не требуются")}`
                      : "Отдельные права не требуются или задаются в токене."
                },
                {
                  label: "Проверки",
                  value: shortList(selected.healthChecks, "проверка здоровья после авторизации"),
                  hint: selected.supportsWebhooks
                    ? "Проверка вебхука входит в маршрут."
                    : "Вебхук не заявлен в контракте."
                },
                {
                  label: "Импорт",
                  value: selected.testImport?.supported ? "Можно запустить" : "Ограничен",
                  hint: testImportLabel(selected)
                }
              ]}
              limitations={selected.limitations?.slice(0, 3)}
            />

            <FieldGroup className="gap-4">
              {selected.urlPolicy === "fixed" ? (
                <input type="hidden" name="baseUrl" value={selected.fixedBaseUrl ?? ""} />
              ) : (
                <Field>
                  <FieldLabel htmlFor="connect-base-url">Адрес источника</FieldLabel>
                  <Input
                    id="connect-base-url"
                    name="baseUrl"
                    type="url"
                    required={selected.urlPolicy === "required"}
                    placeholder="https://example.zendesk.com"
                  />
                </Field>
              )}

              {selected.fields.map((field) => (
                <Field key={field.key}>
                  <FieldLabel htmlFor={`connect-field-${field.key}`}>{field.label}</FieldLabel>
                  <Input
                    id={`connect-field-${field.key}`}
                    name={field.key}
                    type={field.secret ? "password" : "text"}
                    placeholder={field.placeholder}
                    pattern={field.format}
                    autoComplete={field.secret ? "new-password" : "off"}
                  />
                  {field.hint ? <FieldDescription>{field.hint}</FieldDescription> : null}
                  {field.secret ? (
                    <FieldDescription>
                      Секрет write-only: вводится для проверки и сохранения, обратно в UI не
                      отображается.
                    </FieldDescription>
                  ) : null}
                </Field>
              ))}

              <Field>
                <FieldLabel htmlFor="connect-test-ticket">№ тикета (необязательно)</FieldLabel>
                <Input id="connect-test-ticket" name="testTicketId" type="text" />
              </Field>

              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton />
              </div>
            </FieldGroup>
          </form>
        ) : sources.length > 0 ? (
          <p className="text-sm text-muted-foreground">Выберите тип источника, чтобы продолжить.</p>
        ) : null}

        {hasError(state) ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Не удалось подключить</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}

        {steps.length > 0 ? (
          <div className="grid gap-3 border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground">Ход подключения</p>
            <ul className="grid gap-2">
              {steps.map((step) => (
                <li key={step.step} className="flex items-start gap-2 text-sm">
                  <span className={cn("mt-0.5 font-semibold", STATUS_COLORS[step.status])} aria-hidden="true">
                    {STATUS_ICONS[step.status]}
                  </span>
                  <span className="grid gap-0.5">
                    <span className="font-medium text-foreground">{STEP_LABELS[step.step] ?? step.step}</span>
                    {step.detail ? <span className="text-muted-foreground">{step.detail}</span> : null}
                    {step.hint ? (
                      <span className={cn("text-xs", step.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                        {step.hint}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {capabilityMatrix ? (
              <div className="grid gap-2 rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-foreground">Матрица возможностей (probe)</p>
                <ul className="grid gap-1.5">
                  {capabilityMatrix.rows.map((row) => (
                    <li key={row.key} className="flex items-start justify-between gap-2 text-sm">
                      <span className="min-w-0 break-words text-foreground">{row.label}</span>
                      <span className={cn("shrink-0 font-medium", STATUS_COLORS[row.status === "unknown" ? "skipped" : row.status])}>
                        {row.status === "ok"
                          ? "probe ok"
                          : row.status === "warning"
                            ? "частично"
                            : row.status === "failed"
                              ? "ошибка"
                              : "н/д"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">{capabilityMatrix.honestyNote}</p>
              </div>
            ) : null}
            {connected ? (
              <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300">
                <Info className="text-amber-700 dark:text-amber-400" />
                <AlertTitle className="text-amber-900 dark:text-amber-200">
                  Базовое подключение сохранено
                </AlertTitle>
                <AlertDescription className="text-amber-800 dark:text-amber-300">
                  Проверка доступа прошла, источник записан. Это ещё не production-ready: зелёный
                  статус — только после живой сертификации с evidence.
                </AlertDescription>
              </Alert>
            ) : null}
            {nextAction ? (
              <Alert
                variant={nextAction.severity === "negative" ? "destructive" : "default"}
                className={cn(
                  nextAction.severity === "warning" &&
                    "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                )}
              >
                {nextAction.severity === "negative" ? <AlertCircle /> : <Info />}
                <AlertTitle>{nextAction.label}</AlertTitle>
                <AlertDescription>{nextAction.description}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}

        <Collapsible
          open={detailsOpen}
          onOpenChange={setAdvancedOpen}
          className="overflow-clip rounded-lg border border-border"
        >
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Расширенные настройки
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                detailsOpen && "rotate-180"
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-2 border-t border-border p-4 text-sm text-muted-foreground">
            {fallbackOpen ? (
              <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300">
                <Info />
                <AlertDescription className="text-amber-800 dark:text-amber-300">
                  Заполните параметры вручную и повторите.
                </AlertDescription>
              </Alert>
            ) : (
              <p>Ручная настройка параметров подключения для нестандартных конфигураций.</p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
