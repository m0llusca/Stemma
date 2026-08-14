"use client";

import { Save } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  FieldLabel,
  FieldLegend,
  FieldSet
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ActionFlowGuard } from "@/components/action-flow-guard";
import { type OtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import { otrsFamilyProfiles } from "@/lib/integrations/otrs-family/profiles";
import { saveOtrsIntegrationConfigurationState, type IntegrationActionState } from "@/lib/integration-actions";
import { detectOtrsRoutesAction, type DetectOtrsRoutesState } from "@/lib/otrs-import-actions";

const initialState: IntegrationActionState = null;

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
    <Button type="submit" disabled={pending}>
      <Save data-icon="inline-start" aria-hidden="true" />
      {pending ? "Сохраняем" : "Сохранить OTRS"}
    </Button>
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
  const [actionState, formAction] = useActionState(saveOtrsIntegrationConfigurationState, initialState);
  // The bridged result feeds the alert when the client router drops the
  // action commit (Next 16.2.x); the healthy path is untouched.
  const [bridgedState, setBridgedState] = useState<IntegrationActionState>(null);
  const state = bridgedState ?? actionState;
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
  const [userLoginValue, setUserLoginValue] = useState(userLogin || "agent_login");

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
  useEffect(() => {
    setUserLoginValue(userLogin || "agent_login");
  }, [userLogin]);
  const products = Object.values(otrsFamilyProfiles);
  const credentialByKind = useMemo(() => new Map(credentials.map((credential) => [credential.kind, credential])), [credentials]);
  const passwordSlot = credentialByKind.get("auth_password");
  const caSlot = credentialByKind.get("ca_bundle");
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
    <Card
      className="overflow-clip"
      role="region"
      aria-labelledby="otrs-connection-title"
    >
      <CardHeader className="border-b">
        <CardTitle id="otrs-connection-title">Настройка подключения</CardTitle>
        <CardDescription>
          Секреты вводятся только для обновления. Сохраненные пароль и CA PEM не отображаются обратно в UI.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-5 pt-(--card-spacing)">
        <form action={detectAction} className="grid gap-2 border-b pb-4">
          <input type="hidden" name="baseUrl" value={integration.baseUrl ?? ""} />
          <input type="hidden" name="webServiceName" value={webServiceName} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="outline" disabled={detecting}>
              {detecting ? "Определяем..." : "Определить маршруты автоматически"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Пробует стандартные маршруты GenericInterface и заполняет переопределения маршрутов.
            </span>
          </div>
          {detectState?.ok === false ? (
            <Alert variant="destructive">
              <AlertDescription>{detectState.message}</AlertDescription>
            </Alert>
          ) : null}
          {detectState?.ok && detectState.result.undetected.length > 0 ? (
            <Alert>
              <AlertDescription>
                Не определены: {detectState.result.undetected.join(", ")} — введите вручную.
              </AlertDescription>
            </Alert>
          ) : null}
        </form>

        <form action={formAction} className="grid gap-5">
          <ActionFlowGuard
            onResult={(value) => {
              const result = value as IntegrationActionState;
              if (result) setBridgedState(result);
            }}
          />
          <input type="hidden" name="source" value={integration.source} />
          <input type="hidden" name="configJson" value={routeConfigJson(config, routes, routeOverridesEnabled, auth, timeZone)} />

          <Tabs defaultValue="connection" className="gap-4">
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value="connection">Подключение</TabsTrigger>
              <TabsTrigger value="auth">Авторизация</TabsTrigger>
              <TabsTrigger value="limits">Лимиты</TabsTrigger>
              <TabsTrigger value="advanced">Дополнительно</TabsTrigger>
            </TabsList>

            <TabsContent value="connection" keepMounted className="grid gap-4">
              <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="otrs-displayName">Название</FieldLabel>
                  <Input id="otrs-displayName" name="displayName" defaultValue={integration.displayName} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="otrs-product">Профиль продукта</FieldLabel>
                  <NativeSelect id="otrs-product" name="product" defaultValue={config.product} className="w-full">
                    {products.map((product) => (
                      <NativeSelectOption key={product.product} value={product.product}>
                        {product.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="otrs-baseUrl">Base URL</FieldLabel>
                  <Input id="otrs-baseUrl" name="baseUrl" defaultValue={integration.baseUrl ?? ""} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="otrs-webServiceName">Имя WebService</FieldLabel>
                  <Input
                    id="otrs-webServiceName"
                    name="webServiceName"
                    value={webServiceName}
                    onChange={(event) => setWebServiceName(event.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="otrs-timeZone">Таймзона OTRS-сервера</FieldLabel>
                  <NativeSelect
                    id="otrs-timeZone"
                    name="timeZone"
                    value={timeZone}
                    onChange={(event) => setTimeZone(event.target.value)}
                    className="w-full"
                  >
                    {OTRS_TIME_ZONES.map((zone) => (
                      <NativeSelectOption key={zone} value={zone}>
                        {zone}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="otrs-basePath">Base path</FieldLabel>
                  <Input id="otrs-basePath" name="basePath" defaultValue={config.basePath} required />
                </Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="auth" keepMounted className="grid gap-4">
              <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="otrs-userLogin">UserLogin</FieldLabel>
                  <Input
                    id="otrs-userLogin"
                    name="userLogin"
                    value={userLoginValue}
                    onChange={(event) => setUserLoginValue(event.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="otrs-password">Пароль или API-секрет</FieldLabel>
                  <Input id="otrs-password" name="password" type="password" autoComplete="new-password" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="otrs-sessionCreatePath">SessionCreate path</FieldLabel>
                  <Input
                    id="otrs-sessionCreatePath"
                    value={sessionCreatePath}
                    onChange={(event) => setSessionCreatePath(event.target.value)}
                    placeholder="/Session"
                    className="font-mono text-xs"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="otrs-ticketSearchAuth">Авторизация TicketSearch</FieldLabel>
                  <NativeSelect
                    id="otrs-ticketSearchAuth"
                    value={ticketSearchAuth}
                    onChange={(event) => setTicketSearchAuth(event.target.value as "credentials" | "session")}
                    className="w-full"
                  >
                    <NativeSelectOption value="credentials">UserLogin + Password</NativeSelectOption>
                    <NativeSelectOption value="session">SessionCreate + SessionID</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="otrs-ticketGetAuth">Авторизация TicketGet</FieldLabel>
                  <NativeSelect
                    id="otrs-ticketGetAuth"
                    value={ticketGetAuth}
                    onChange={(event) => setTicketGetAuth(event.target.value as "credentials" | "session")}
                    className="w-full"
                  >
                    <NativeSelectOption value="credentials">UserLogin + Password</NativeSelectOption>
                    <NativeSelectOption value="session">SessionCreate + SessionID</NativeSelectOption>
                  </NativeSelect>
                </Field>
              </FieldGroup>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <Field>
                  <FieldLabel htmlFor="otrs-caBundle">CA bundle PEM</FieldLabel>
                  <Textarea id="otrs-caBundle" name="caBundle" rows={5} spellCheck={false} className="min-h-[110px] resize-y" />
                </Field>
                <div className="grid content-start gap-2">
                  <Card size="sm">
                    <CardContent className="grid gap-1">
                      <p className="text-xs font-medium text-muted-foreground">Слот пароля</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={passwordSlot ? "secondary" : "outline"}>
                          {passwordSlot ? "Сохранен" : "Не сохранен"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Ротация: {formatDate(passwordSlot?.lastRotatedAt ?? null)}</p>
                    </CardContent>
                  </Card>
                  <Card size="sm">
                    <CardContent className="grid gap-1">
                      <p className="text-xs font-medium text-muted-foreground">Слот CA bundle</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={caSlot ? "secondary" : "outline"}>{caSlot ? "Сохранен" : "Не сохранен"}</Badge>
                      </div>
                      <p className="break-all text-xs text-muted-foreground">
                        Fingerprint: {caSlot?.fingerprint ? caSlot.fingerprint.slice(0, 16) : "нет"}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="limits" keepMounted className="grid gap-4">
              <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="otrs-searchLimit">Лимит поиска</FieldLabel>
                  <Input
                    id="otrs-searchLimit"
                    name="searchLimit"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={config.limits.searchLimit}
                    className="tabular-nums"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="otrs-manualTicketIdLimit">Лимит ручных TicketID</FieldLabel>
                  <Input
                    id="otrs-manualTicketIdLimit"
                    name="manualTicketIdLimit"
                    type="number"
                    min={1}
                    max={50}
                    defaultValue={config.limits.manualTicketIdLimit}
                    className="tabular-nums"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="otrs-importLimit">Лимит импорта</FieldLabel>
                  <Input
                    id="otrs-importLimit"
                    name="importLimit"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={integration.importLimit}
                    className="tabular-nums"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="otrs-batchSize">Размер батча</FieldLabel>
                  <Input
                    id="otrs-batchSize"
                    name="batchSize"
                    type="number"
                    min={1}
                    max={50}
                    defaultValue={integration.batchSize}
                    className="tabular-nums"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="otrs-dateRangeDays">Период, дней</FieldLabel>
                  <Input
                    id="otrs-dateRangeDays"
                    name="dateRangeDays"
                    type="number"
                    min={1}
                    max={365}
                    defaultValue={integration.dateRangeDays}
                    className="tabular-nums"
                  />
                </Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="advanced" keepMounted className="grid gap-4">
              <Field orientation="horizontal" className="items-start rounded-lg border p-3">
                <Switch
                  id="otrs-routeOverrides"
                  checked={routeOverridesEnabled}
                  onCheckedChange={setRouteOverridesEnabled}
                />
                <FieldLabel htmlFor="otrs-routeOverrides" className="font-normal">
                  <span className="font-medium">Включить переопределения маршрутов</span>
                  <FieldDescription>
                    Используйте только если GenericInterface WebService создан с нестандартными маршрутами.
                  </FieldDescription>
                </FieldLabel>
              </Field>

              <div className="grid gap-3 xl:grid-cols-2">
                <FieldSet className="gap-3 rounded-lg border p-3">
                  <FieldLegend variant="label">Маршрут TicketSearch</FieldLegend>
                  <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                    <Field>
                      <FieldLabel htmlFor="otrs-ticketSearchMethod">Метод</FieldLabel>
                      <NativeSelect
                        id="otrs-ticketSearchMethod"
                        value={ticketSearchMethod}
                        onChange={(event) => setTicketSearchMethod(event.target.value as "GET" | "POST")}
                        disabled={!routeOverridesEnabled}
                        className="w-full"
                      >
                        <NativeSelectOption value="POST">POST</NativeSelectOption>
                        <NativeSelectOption value="GET">GET</NativeSelectOption>
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="otrs-ticketSearchPath">Путь</FieldLabel>
                      <Input
                        id="otrs-ticketSearchPath"
                        value={ticketSearchPath}
                        onChange={(event) => setTicketSearchPath(event.target.value)}
                        disabled={!routeOverridesEnabled}
                        placeholder="/Ticket/Search"
                        className="font-mono text-xs"
                      />
                    </Field>
                  </div>
                </FieldSet>
                <FieldSet className="gap-3 rounded-lg border p-3">
                  <FieldLegend variant="label">Маршрут TicketGet</FieldLegend>
                  <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                    <Field>
                      <FieldLabel htmlFor="otrs-ticketGetMethod">Метод</FieldLabel>
                      <NativeSelect
                        id="otrs-ticketGetMethod"
                        value={ticketGetMethod}
                        onChange={(event) => setTicketGetMethod(event.target.value as "GET" | "POST")}
                        disabled={!routeOverridesEnabled}
                        className="w-full"
                      >
                        <NativeSelectOption value="GET">GET</NativeSelectOption>
                        <NativeSelectOption value="POST">POST</NativeSelectOption>
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="otrs-ticketGetPath">Путь</FieldLabel>
                      <Input
                        id="otrs-ticketGetPath"
                        value={ticketGetPath}
                        onChange={(event) => setTicketGetPath(event.target.value)}
                        disabled={!routeOverridesEnabled}
                        placeholder="/Ticket/{TicketID}"
                        className="font-mono text-xs"
                      />
                    </Field>
                  </div>
                </FieldSet>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton />
            {state ? (
              <Alert variant={state.ok ? "default" : "destructive"} className="w-fit py-1.5">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
