# One-Button Source Connect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить 5-шаговый мастер добавления источника одно-кнопочным авто-подключением: тип + URL → конвейер probe/detect/verify → источник `active`, с живым чек-листом статусов и ручным fallback.

**Architecture:** Реестр `SourceConnectionProfile` (по источнику) объявляет нормализацию URL, поля кредов, авто-детект и дешёвый auth-probe. Единый оркестратор `connectSource` гонит шаги и возвращает журнал; server-action — тонкая обёртка; клиент-компонент рисует журнал чек-листом и роняет на «Расширенные настройки» при сбое. Переиспользует OTRS route-detection, helpdesk-адаптеры, net-guard, secret-слоты.

**Tech Stack:** TypeScript, Next.js (App Router, server actions, useActionState), Zod, Vitest + @testing-library/react, Prisma. Без новых зависимостей.

**Рабочая директория всех путей:** `apps/web/`. Ветка `feat/one-button-connect` уже создана; spec — `docs/superpowers/specs/2026-06-11-one-button-source-connect-design.md`.

---

## File Structure

**Создаются:**
- `src/lib/integrations/connect/types.ts` — интерфейсы профиля, контекста, журнала.
- `src/lib/integrations/connect/url-normalize.ts` — общие хелперы парсинга URL.
- `src/lib/integrations/connect/profiles/helpdesk.ts` — фабрика `buildHelpdeskProfile` + 5 helpdesk-профилей.
- `src/lib/integrations/connect/profiles/otrs.ts` — OTRS-профиль (reuse detection).
- `src/lib/integrations/connect/profiles/data-source.ts` — YDB/YTsaurus профили.
- `src/lib/integrations/connect/profiles/enterprise.ts` — Salesforce/ServiceNow/Dynamics (client-credentials + бейдж).
- `src/lib/integrations/connect/profiles/index.ts` — реестр `getConnectionProfile(source)`.
- `src/lib/integrations/connect/orchestrator.ts` — `connectSource` конвейер.
- `src/lib/connect-actions.ts` — server-action `connectSourceAction` (`"use server"`).
- `src/components/integrations/connect-source-form.tsx` — UI + чек-лист.
- тесты: `tests/unit/connect-url-normalize.test.ts`, `connect-profiles-verify.test.ts`, `connect-orchestrator.test.ts`, `connect-source-form.test.tsx`, `connect-otrs-e2e.test.ts`.

**Изменяются:**
- `src/app/admin/integrations/new/page.tsx` — рендерит `ConnectSourceForm`.

**Удаляется (финальный коммит после миграции роута):**
- `src/components/integrations/integration-setup-workspace.tsx`.

---

## Task 1: Типы connect-слоя

**Files:**
- Create: `src/lib/integrations/connect/types.ts`

- [ ] **Step 1: Написать типы**

```ts
import type { CustomConversationInput } from "@/lib/validation/custom-api";

export type ConnectStepKey =
  | "validate_url"
  | "reachability"
  | "auto_detect"
  | "verify_auth"
  | "persist"
  | "test_import";

export type ConnectStepStatus = "ok" | "warning" | "failed" | "skipped";

export type ConnectStep = {
  step: ConnectStepKey;
  status: ConnectStepStatus;
  detail?: string;
  hint?: string;
};

export type UrlHints = {
  basePath?: string;
  testTicketId?: string;
  detectedSource?: string;
};

export type CredentialField = {
  key: string;
  label: string;
  placeholder?: string;
  format?: string; // RegExp source string (serialisable to the client)
  hint?: string;
  secret: boolean;
};

// Креды, собранные формой: { [field.key]: value }
export type ConnectCredentials = Record<string, string>;

export type ConnectContext = {
  baseUrl: string;
  credentials: ConnectCredentials;
  hints?: UrlHints;
  testTicketId?: string;
  config: Record<string, unknown>; // накапливается autoDetect
};

export type AutoDetectResult = {
  status: ConnectStepStatus;
  detail?: string;
  hint?: string;
  config?: Record<string, unknown>; // вливается в ctx.config
};

export type VerifyResult = {
  status: "ok" | "failed";
  detail?: string;
  hint?: string;
  authMode: string; // сохраняется в Integration.authMode
  secretSlots: Array<{ kind: string; secret: string }>; // что положить в зашифрованные слоты
};

export type TestImportResult = {
  status: ConnectStepStatus;
  detail?: string;
  hint?: string;
  conversation?: CustomConversationInput;
};

export type SourceConnectionProfile = {
  source: string;
  type: "otrs_family" | "native_helpdesk" | "enterprise" | "data_source";
  urlPolicy: "required" | "fixed" | "optional";
  fixedBaseUrl?: string;
  hostPatterns?: RegExp[];
  credentialFields: CredentialField[];
  normalizeUrl(raw: string): { baseUrl: string; hints?: UrlHints };
  autoDetect?(ctx: ConnectContext): Promise<AutoDetectResult>;
  verifyAuth(ctx: ConnectContext): Promise<VerifyResult>;
  testImport?(ctx: ConnectContext): Promise<TestImportResult>;
};
```

- [ ] **Step 2: Проверить типы**

Run: `cd /Users/dubrsky/Downloads/qc_app/apps/web && npx tsc --noEmit 2>&1 | grep -i "connect/types" || echo "ok"`
Expected: ok.

- [ ] **Step 3: Коммит**

```bash
git add src/lib/integrations/connect/types.ts
git commit -m "feat(connect): connection-profile and journal types"
```

---

## Task 2: Нормализация URL

**Files:**
- Create: `src/lib/integrations/connect/url-normalize.ts`
- Test: `tests/unit/connect-url-normalize.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, expect, it } from "vitest";
import { normalizeHelpdeskBaseUrl, extractTicketIdFromPath, detectSourceFromHost } from "@/lib/integrations/connect/url-normalize";

describe("normalizeHelpdeskBaseUrl", () => {
  it("strips OTRS index.pl path to the base", () => {
    expect(normalizeHelpdeskBaseUrl("https://otrs.fsa.gov.ru/otrs/index.pl?Action=AgentDashboard").baseUrl).toBe("https://otrs.fsa.gov.ru/otrs");
  });
  it("reduces a Zendesk agent ticket url to origin", () => {
    expect(normalizeHelpdeskBaseUrl("https://acme.zendesk.com/agent/tickets/123").baseUrl).toBe("https://acme.zendesk.com");
  });
  it("reduces a Jira browse url to origin", () => {
    expect(normalizeHelpdeskBaseUrl("https://acme.atlassian.net/browse/SUP-42").baseUrl).toBe("https://acme.atlassian.net");
  });
});

describe("extractTicketIdFromPath", () => {
  it("pulls a Zendesk ticket id", () => {
    expect(extractTicketIdFromPath("https://acme.zendesk.com/agent/tickets/123")).toBe("123");
  });
  it("pulls a Jira issue key", () => {
    expect(extractTicketIdFromPath("https://acme.atlassian.net/browse/SUP-42")).toBe("SUP-42");
  });
  it("returns undefined when no id present", () => {
    expect(extractTicketIdFromPath("https://acme.zendesk.com")).toBeUndefined();
  });
});

describe("detectSourceFromHost", () => {
  it.each([
    ["https://acme.zendesk.com", "zendesk"],
    ["https://acme.freshdesk.com", "freshdesk"],
    ["https://acme.atlassian.net", "jira"],
    ["https://acme.service-now.com", "servicenow"]
  ])("maps %s to %s", (url, source) => {
    expect(detectSourceFromHost(url)).toBe(source);
  });
  it("returns undefined for a self-hosted host", () => {
    expect(detectSourceFromHost("https://otrs.fsa.gov.ru/otrs")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/connect-url-normalize.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Реализовать**

```ts
const HOST_SOURCE_PATTERNS: Array<{ pattern: RegExp; source: string }> = [
  { pattern: /(^|\.)zendesk\.com$/i, source: "zendesk" },
  { pattern: /(^|\.)freshdesk\.com$/i, source: "freshdesk" },
  { pattern: /(^|\.)atlassian\.net$/i, source: "jira" },
  { pattern: /(^|\.)service-now\.com$/i, source: "servicenow" },
  { pattern: /(^|\.)crm\.dynamics\.com$/i, source: "dynamics" },
  { pattern: /(^|\.)my\.salesforce\.com$/i, source: "salesforce" }
];

export function detectSourceFromHost(rawUrl: string): string | undefined {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return HOST_SOURCE_PATTERNS.find((entry) => entry.pattern.test(host))?.source;
  } catch {
    return undefined;
  }
}

export function extractTicketIdFromPath(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    const ticket = url.pathname.match(/\/tickets?\/(\d+)/i);
    if (ticket) return ticket[1];
    const issue = url.pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    if (issue) return issue[1];
    const otrsId = url.searchParams.get("TicketID");
    if (otrsId) return otrsId;
    return undefined;
  } catch {
    return undefined;
  }
}

// Сводит произвольную ссылку helpdesk к базовому URL. Для OTRS сохраняет basePath
// (первый сегмент вида /otrs, /znuny, /otobo); для прочих — origin.
export function normalizeHelpdeskBaseUrl(rawUrl: string): { baseUrl: string; basePath?: string } {
  const url = new URL(rawUrl);
  const otrsBase = url.pathname.match(/^\/(otrs|znuny|otobo)(\/|$)/i);
  if (otrsBase) {
    return { baseUrl: `${url.origin}/${otrsBase[1]}`, basePath: `/${otrsBase[1]}` };
  }
  return { baseUrl: url.origin };
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/unit/connect-url-normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/integrations/connect/url-normalize.ts tests/unit/connect-url-normalize.test.ts
git commit -m "feat(connect): URL normalization, ticket-id and source-from-host extraction"
```

---

## Task 3: Helpdesk-профили (Zendesk/Freshdesk/Intercom/HubSpot/Jira)

**Files:**
- Create: `src/lib/integrations/connect/profiles/helpdesk.ts`
- Test: `tests/unit/connect-profiles-verify.test.ts`

Каждый helpdesk-источник одинаков по структуре — отличается endpoint'ом verifyAuth, способом построения auth-заголовка, полями кредов и host-паттерном. Поэтому одна фабрика + 5 конфигов (DRY).

- [ ] **Step 1: Написать падающий тест verifyAuth-классификации**

```ts
import { describe, expect, it, vi } from "vitest";
import { helpdeskProfiles } from "@/lib/integrations/connect/profiles/helpdesk";

const zendesk = helpdeskProfiles.zendesk;

describe("helpdesk verifyAuth", () => {
  it("zendesk: 200 -> ok with email/token basic credential slot", async () => {
    const transport = vi.fn(async () => ({ statusCode: 200, body: Buffer.from('{"user":{"id":1}}') }));
    const result = await zendesk.verifyAuth({
      baseUrl: "https://acme.zendesk.com",
      credentials: { email: "a@b.c", apiToken: "tok" },
      config: {},
      // @ts-expect-error test injects transport via the profile's optional probe override
      __transport: transport
    });
    expect(result.status).toBe("ok");
    expect(result.authMode).toBe("basic_api_token");
    expect(result.secretSlots[0].kind).toBe("auth_password");
    expect(result.secretSlots[0].secret).toBe("a@b.c/token:tok");
  });

  it("zendesk: 401 -> failed with russian hint", async () => {
    const transport = vi.fn(async () => ({ statusCode: 401, body: Buffer.from("denied") }));
    const result = await zendesk.verifyAuth({
      baseUrl: "https://acme.zendesk.com",
      credentials: { email: "a@b.c", apiToken: "bad" },
      config: {},
      // @ts-expect-error test transport
      __transport: transport
    });
    expect(result.status).toBe("failed");
    expect(result.hint).toMatch(/401|токен|пароль/i);
  });

  it("intercom profile uses a fixed base url and hides the url field", () => {
    expect(helpdeskProfiles.intercom.urlPolicy).toBe("fixed");
    expect(helpdeskProfiles.intercom.fixedBaseUrl).toBe("https://api.intercom.io");
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/connect-profiles-verify.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Реализовать фабрику + конфиги**

```ts
import {
  bearerHeaders,
  basicApiTokenHeaders,
  basicCredentialHeaders,
  createHelpdeskHttpClient
} from "@/lib/integrations/helpdesk-adapters/http";
import { createHelpdeskAdapter } from "@/lib/integrations/helpdesk-adapters/index";
import type { PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";
import {
  detectSourceFromHost,
  extractTicketIdFromPath,
  normalizeHelpdeskBaseUrl
} from "@/lib/integrations/connect/url-normalize";
import type {
  ConnectContext,
  CredentialField,
  SourceConnectionProfile,
  VerifyResult
} from "@/lib/integrations/connect/types";

type HelpdeskProfileConfig = {
  source: PhaseBHelpdeskSource;
  urlPolicy: "required" | "fixed";
  fixedBaseUrl?: string;
  hostPattern?: RegExp;
  authMode: string;
  credentialFields: CredentialField[];
  // строит секрет для слота auth_password из собранных полей
  buildSecret(creds: Record<string, string>): string;
  // путь дешёвого whoami/list probe и заголовок авторизации
  verifyPath: string;
  authHeaders(secret: string): Record<string, string>;
};

// внутренний transport-инъектор только для тестов
type TestableContext = ConnectContext & { __transport?: (req: unknown) => Promise<{ statusCode: number; body: Buffer }> };

function buildHelpdeskProfile(config: HelpdeskProfileConfig): SourceConnectionProfile {
  return {
    source: config.source,
    type: "native_helpdesk",
    urlPolicy: config.urlPolicy,
    fixedBaseUrl: config.fixedBaseUrl,
    hostPatterns: config.hostPattern ? [config.hostPattern] : undefined,
    credentialFields: config.credentialFields,
    normalizeUrl(raw: string) {
      if (config.urlPolicy === "fixed") {
        return { baseUrl: config.fixedBaseUrl!, hints: { detectedSource: config.source } };
      }
      const { baseUrl } = normalizeHelpdeskBaseUrl(raw);
      return {
        baseUrl,
        hints: {
          detectedSource: detectSourceFromHost(raw),
          testTicketId: extractTicketIdFromPath(raw)
        }
      };
    },
    async verifyAuth(ctx: TestableContext): Promise<VerifyResult> {
      const secret = config.buildSecret(ctx.credentials);
      const client = createHelpdeskHttpClient(ctx.__transport ? { transport: ctx.__transport as never } : {});
      try {
        const response = await client.requestJson({
          source: config.source,
          operation: "diagnostics",
          method: "GET",
          url: `${ctx.baseUrl}${config.verifyPath}`,
          headers: config.authHeaders(secret),
          timeoutMs: 15_000,
          maxResponseBytes: 200_000
        });
        // requestJson возвращает { statusCode, body, diagnostic }; считаем 2xx успехом.
        const statusCode = (response as { diagnostic?: { statusCode?: number } }).diagnostic?.statusCode ?? 200;
        if (statusCode >= 200 && statusCode < 300) {
          return { status: "ok", detail: "Авторизация подтверждена.", authMode: config.authMode, secretSlots: [{ kind: "auth_password", secret }] };
        }
        return verifyFailure(statusCode);
      } catch (error) {
        return { status: "failed", detail: "Не удалось подключиться к источнику.", hint: error instanceof Error ? error.message : undefined, authMode: config.authMode, secretSlots: [] };
      }
    },
    async testImport(ctx: ConnectContext) {
      const ticketId = ctx.testTicketId ?? ctx.hints?.testTicketId;
      if (!ticketId) {
        return { status: "skipped" as const, detail: "Укажите № тикета для пробного импорта." };
      }
      const secret = config.buildSecret(ctx.credentials);
      try {
        const adapter = createHelpdeskAdapter(config.source);
        const result = await adapter.loadConversation({ source: config.source, baseUrl: ctx.baseUrl, externalId: ticketId, token: secret });
        return { status: "ok" as const, detail: `Импортировано обращений: ${result.conversations.length}.`, conversation: result.conversations[0] };
      } catch (error) {
        return { status: "warning" as const, detail: "Пробный импорт не удался, но авторизация подтверждена.", hint: error instanceof Error ? error.message : undefined };
      }
    }
  };
}

function verifyFailure(statusCode: number): VerifyResult {
  const hint =
    statusCode === 401 || statusCode === 403
      ? "Авторизация отклонена — проверьте токен/пароль."
      : statusCode === 404
        ? "Эндпоинт не найден — проверьте адрес источника."
        : `Источник ответил кодом ${statusCode}.`;
  return { status: "failed", detail: hint, hint, authMode: "", secretSlots: [] };
}

const emailTokenFields: CredentialField[] = [
  { key: "email", label: "Email агента", placeholder: "agent@example.com", secret: false, hint: "Учётная запись агента, к которой привязан API-токен." },
  { key: "apiToken", label: "API-токен", secret: true, hint: "Создаётся в настройках API источника." }
];

const singleTokenField: CredentialField[] = [
  { key: "token", label: "Токен доступа", secret: true, hint: "Bearer/Private App токен из настроек интеграций." }
];

export const helpdeskProfiles = {
  zendesk: buildHelpdeskProfile({
    source: "zendesk",
    urlPolicy: "required",
    hostPattern: /(^|\.)zendesk\.com$/i,
    authMode: "basic_api_token",
    credentialFields: emailTokenFields,
    buildSecret: (c) => `${c.email}/token:${c.apiToken}`,
    verifyPath: "/api/v2/users/me.json",
    authHeaders: (secret) => basicCredentialHeaders(secret)
  }),
  freshdesk: buildHelpdeskProfile({
    source: "freshdesk",
    urlPolicy: "required",
    hostPattern: /(^|\.)freshdesk\.com$/i,
    authMode: "basic_api_key",
    credentialFields: singleTokenField,
    buildSecret: (c) => c.token,
    verifyPath: "/api/v2/agents/me",
    authHeaders: (secret) => basicApiTokenHeaders(secret, "X")
  }),
  intercom: buildHelpdeskProfile({
    source: "intercom",
    urlPolicy: "fixed",
    fixedBaseUrl: "https://api.intercom.io",
    authMode: "bearer_token",
    credentialFields: singleTokenField,
    buildSecret: (c) => c.token,
    verifyPath: "/me",
    authHeaders: (secret) => bearerHeaders(secret)
  }),
  hubspot: buildHelpdeskProfile({
    source: "hubspot",
    urlPolicy: "fixed",
    fixedBaseUrl: "https://api.hubapi.com",
    authMode: "private_app_token",
    credentialFields: singleTokenField,
    buildSecret: (c) => c.token,
    verifyPath: "/account-info/v3/details",
    authHeaders: (secret) => bearerHeaders(secret)
  }),
  jira: buildHelpdeskProfile({
    source: "jira",
    urlPolicy: "required",
    hostPattern: /(^|\.)atlassian\.net$/i,
    authMode: "basic_api_token",
    credentialFields: emailTokenFields,
    buildSecret: (c) => `${c.email}:${c.apiToken}`,
    verifyPath: "/rest/api/2/myself",
    authHeaders: (secret) => basicCredentialHeaders(secret)
  })
} satisfies Record<string, SourceConnectionProfile>;
```

ВАЖНО для исполнителя: проверь фактический возврат `createHelpdeskHttpClient().requestJson` (в http.ts ~строки 54-120) — какие поля несёт результат (`statusCode`/`body`/`diagnostic`). Код выше читает `diagnostic.statusCode`; если статус доступен напрямую (`response.statusCode`), используй его. На не-2xx `requestJson` может бросать или возвращать — выясни и обработай оба пути (catch + проверка кода). Также проверь сигнатуру `createHelpdeskAdapter(source)` в helpdesk-adapters/index.ts — она принимает source и возвращает объект с `loadConversation`.

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/unit/connect-profiles-verify.test.ts`
Expected: PASS (после сверки формы ответа requestJson).

- [ ] **Step 5: Коммит**

```bash
git add src/lib/integrations/connect/profiles/helpdesk.ts tests/unit/connect-profiles-verify.test.ts
git commit -m "feat(connect): helpdesk connection profiles (zendesk/freshdesk/intercom/hubspot/jira)"
```

---

## Task 4: OTRS-профиль (reuse detection)

**Files:**
- Create: `src/lib/integrations/connect/profiles/otrs.ts`
- Test: `tests/unit/connect-profiles-verify.test.ts` (дополнить)

- [ ] **Step 1: Дописать падающий тест**

```ts
import { otrsConnectionProfile } from "@/lib/integrations/connect/profiles/otrs";

describe("otrs connection profile", () => {
  it("normalizeUrl keeps the /otrs base path and detects no host source", () => {
    const out = otrsConnectionProfile.normalizeUrl("https://otrs.fsa.gov.ru/otrs/index.pl?Action=AgentDashboard");
    expect(out.baseUrl).toBe("https://otrs.fsa.gov.ru/otrs");
    expect(out.hints?.basePath).toBe("/otrs");
  });
  it("collects user login and password fields", () => {
    expect(otrsConnectionProfile.credentialFields.map((f) => f.key)).toEqual(["userLogin", "password"]);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/connect-profiles-verify.test.ts -t "otrs connection profile"`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

```ts
import { createOtrsHttpClient } from "@/lib/integrations/otrs-family/client";
import { parseOtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import { detectOtrsRoutes } from "@/lib/integrations/otrs-family/route-detection";
import { createOtrsSession } from "@/lib/integrations/otrs-family/session-auth";
import { buildOtrsWebServiceBaseUrl } from "@/lib/integrations/otrs-family/config";
import { normalizeHelpdeskBaseUrl } from "@/lib/integrations/connect/url-normalize";
import type { AutoDetectResult, ConnectContext, SourceConnectionProfile, VerifyResult } from "@/lib/integrations/connect/types";

const OPERATION_ENUM = { ticketGet: "TicketGet", ticketSearch: "TicketSearch", sessionCreate: "SessionCreate" } as const;

export const otrsConnectionProfile: SourceConnectionProfile = {
  source: "otrs",
  type: "otrs_family",
  urlPolicy: "required",
  credentialFields: [
    { key: "userLogin", label: "Логин агента", secret: false, hint: "Учётная запись агента с доступом к GenericInterface." },
    { key: "password", label: "Пароль", secret: true }
  ],
  normalizeUrl(raw: string) {
    const { baseUrl, basePath } = normalizeHelpdeskBaseUrl(raw);
    return { baseUrl, hints: { basePath } };
  },
  async autoDetect(ctx: ConnectContext): Promise<AutoDetectResult> {
    const webServiceName = String(ctx.config.webServiceName ?? "api");
    const config = parseOtrsConnectorConfig({ webServiceName });
    const client = createOtrsHttpClient({ config, baseUrl: ctx.baseUrl, userLogin: "", password: "" });
    try {
      const routes = await detectOtrsRoutes({
        baseUrl: ctx.baseUrl,
        webServiceName,
        testTicketId: ctx.testTicketId ?? "1",
        probeRoute: (request) =>
          client.probeRoute({
            operation: OPERATION_ENUM[request.operation as keyof typeof OPERATION_ENUM],
            method: request.method,
            url: request.url,
            headers: request.method === "POST" ? { "content-type": "application/json" } : {},
            body: request.method === "POST" ? {} : undefined,
            timeoutMs: config.limits.requestTimeoutMs,
            maxResponseBytes: config.limits.maxResponseBytes
          })
      });
      const detectedConfig: Record<string, unknown> = { webServiceName };
      if (routes.ticketGet || routes.ticketSearch) {
        detectedConfig.advanced = { routeOverridesEnabled: true };
        detectedConfig.routes = {
          ...(routes.ticketGet ? { ticketGetPath: routes.ticketGet.path, ticketGetMethod: routes.ticketGet.method } : {}),
          ...(routes.ticketSearch ? { ticketSearchPath: routes.ticketSearch.path, ticketSearchMethod: routes.ticketSearch.method } : {})
        };
      }
      const undetected = routes.undetected.length ? ` Не определены: ${routes.undetected.join(", ")}.` : "";
      return {
        status: routes.undetected.length ? "warning" : "ok",
        detail: `Маршруты определены.${undetected}`,
        hint: routes.undetected.includes("ticketSearch") ? "Маршрут поиска не привязан — задайте вручную в расширенных настройках." : undefined,
        config: detectedConfig
      };
    } catch (error) {
      return { status: "warning", detail: "Не удалось определить маршруты автоматически.", hint: error instanceof Error ? error.message : undefined };
    }
  },
  async verifyAuth(ctx: ConnectContext): Promise<VerifyResult> {
    const config = parseOtrsConnectorConfig({ webServiceName: String(ctx.config.webServiceName ?? "api"), ...(ctx.config.routes ? { routes: ctx.config.routes } : {}), auth: { ticketGet: "session", ticketSearch: "session" } });
    const client = createOtrsHttpClient({ config, baseUrl: ctx.baseUrl, userLogin: ctx.credentials.userLogin, password: ctx.credentials.password });
    try {
      await createOtrsSession({ client, config, baseUrl: ctx.baseUrl, userLogin: ctx.credentials.userLogin, password: ctx.credentials.password });
      return { status: "ok", detail: "Сессия OTRS создана.", authMode: "session", secretSlots: [{ kind: "auth_password", secret: ctx.credentials.password }] };
    } catch (error) {
      return { status: "failed", detail: "OTRS отклонил учётные данные.", hint: error instanceof Error ? error.message : "Проверьте логин и пароль.", authMode: "session", secretSlots: [] };
    }
  }
};
```

ВАЖНО: сверь точные сигнатуры `createOtrsSession`, `parseOtrsConnectorConfig` (принимает partial), `detectOtrsRoutes`/`probeRoute` (по реализации в route-detection.ts и client.ts — `OtrsOperationRequest` имеет поля operation/method/url/headers/body/timeoutMs/maxResponseBytes, БЕЗ mode). Это те же вызовы, что в `detectOtrsRoutesAction` (src/lib/otrs-import-actions.ts) — скопируй проверенный там адаптер probeRoute.

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/unit/connect-profiles-verify.test.ts -t "otrs connection profile"`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/integrations/connect/profiles/otrs.ts tests/unit/connect-profiles-verify.test.ts
git commit -m "feat(connect): OTRS connection profile reusing route detection"
```

---

## Task 5: Профили data-source и enterprise + реестр

**Files:**
- Create: `src/lib/integrations/connect/profiles/data-source.ts`, `src/lib/integrations/connect/profiles/enterprise.ts`, `src/lib/integrations/connect/profiles/index.ts`
- Test: `tests/unit/connect-profiles-verify.test.ts` (дополнить реестр-тестом)

- [ ] **Step 1: Дописать падающий тест реестра**

```ts
import { getConnectionProfile, listConnectionProfiles } from "@/lib/integrations/connect/profiles";

describe("connection profile registry", () => {
  it.each(["zendesk", "freshdesk", "intercom", "hubspot", "jira", "otrs", "ydb", "ytsaurus", "salesforce", "servicenow", "dynamics"])(
    "resolves a profile for %s",
    (source) => {
      expect(getConnectionProfile(source)?.source).toBe(source);
    }
  );
  it("returns undefined for an unknown source", () => {
    expect(getConnectionProfile("nope")).toBeUndefined();
  });
  it("marks enterprise profiles with a limited-support flag in credentialFields hint or a known set", () => {
    expect(getConnectionProfile("salesforce")?.type).toBe("enterprise");
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/connect-profiles-verify.test.ts -t "connection profile registry"`
Expected: FAIL.

- [ ] **Step 3: Реализовать data-source, enterprise и реестр**

`data-source.ts`: профили `ydb` и `ytsaurus`. `urlPolicy: "required"` (connection string / proxy URL). `credentialFields`: ydb — `connectionString` + `username` + `password` (или static creds как один секрет); ytsaurus — `oauthToken`. `verifyAuth`: ydb — короткий `SELECT 1` через `@/lib/integrations/data-source-adapters/ydb` (сверь экспортируемую функцию выполнения запроса); ytsaurus — `GET {proxy}/api/v3/get?path=//@` с `Authorization: OAuth <token>` через `createHelpdeskHttpClient` или fetch-обёртку проекта. Если выполнение запроса ydb в probe-режиме слишком тяжёлое — реализуй verifyAuth как driver-`ready()` без запроса и пометь detail. secretSlots: kind `data_source_credentials` (ydb) / `data_source_token` (ytsaurus).

`enterprise.ts`: профили `salesforce`, `servicenow`, `dynamics`. `type: "enterprise"`. `credentialFields`: client-credentials (`clientId` + `clientSecret` + при необходимости `instanceUrl`). `verifyAuth`: выполнить токен-обмен/probe там, где возможно (Salesforce `POST /services/oauth2/token` grant_type=client_credentials → ok при выдаче токена); для ServiceNow/Dynamics — basic/oauth probe соответствующего «whoami». Каждый enterprise-профиль помечает ограничение: добавь поле в первый `credentialFields[].hint` или экспортируй множество `limitedSupportSources = new Set(["salesforce","servicenow","dynamics"])` и используй его в UI для бейджа. secretSlots: kind `oauth_client_credentials`.

`index.ts`:
```ts
import { helpdeskProfiles } from "@/lib/integrations/connect/profiles/helpdesk";
import { otrsConnectionProfile } from "@/lib/integrations/connect/profiles/otrs";
import { dataSourceProfiles } from "@/lib/integrations/connect/profiles/data-source";
import { enterpriseProfiles, limitedSupportSources } from "@/lib/integrations/connect/profiles/enterprise";
import type { SourceConnectionProfile } from "@/lib/integrations/connect/types";

const REGISTRY: Record<string, SourceConnectionProfile> = {
  ...helpdeskProfiles,
  otrs: otrsConnectionProfile,
  znuny: { ...otrsConnectionProfile, source: "znuny" },
  otobo: { ...otrsConnectionProfile, source: "otobo" },
  ...dataSourceProfiles,
  ...enterpriseProfiles
};

export function getConnectionProfile(source: string): SourceConnectionProfile | undefined {
  return REGISTRY[source];
}
export function listConnectionProfiles(): SourceConnectionProfile[] {
  return Object.values(REGISTRY);
}
export { limitedSupportSources };
```

ВАЖНО: сверь экспорт исполнителя из data-source-adapters (как выполнить лёгкий запрос/ready) и из helpdesk-adapters/index (createHelpdeskAdapter). Не тащи тяжёлых импортов в файлы, которые попадут в клиентский бандл — реестр импортируется только из server-action и серверного кода.

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/unit/connect-profiles-verify.test.ts`
Expected: PASS (весь файл).

- [ ] **Step 5: Коммит**

```bash
git add src/lib/integrations/connect/profiles/data-source.ts src/lib/integrations/connect/profiles/enterprise.ts src/lib/integrations/connect/profiles/index.ts tests/unit/connect-profiles-verify.test.ts
git commit -m "feat(connect): data-source and enterprise profiles + registry"
```

---

## Task 6: Оркестратор `connectSource`

**Files:**
- Create: `src/lib/integrations/connect/orchestrator.ts`
- Test: `tests/unit/connect-orchestrator.test.ts`

- [ ] **Step 1: Написать падающий тест на фейковом профиле**

```ts
import { describe, expect, it, vi } from "vitest";
import { runConnectPipeline } from "@/lib/integrations/connect/orchestrator";
import type { SourceConnectionProfile } from "@/lib/integrations/connect/types";

function fakeProfile(overrides: Partial<SourceConnectionProfile> = {}): SourceConnectionProfile {
  return {
    source: "fake",
    type: "native_helpdesk",
    urlPolicy: "required",
    credentialFields: [],
    normalizeUrl: (raw) => ({ baseUrl: raw }),
    verifyAuth: vi.fn(async () => ({ status: "ok", authMode: "basic", secretSlots: [{ kind: "auth_password", secret: "s" }] })),
    ...overrides
  };
}

describe("runConnectPipeline", () => {
  it("runs validate->reachability->verify->persist and reports ok journal", async () => {
    const persist = vi.fn(async () => ({ integrationId: "int-1" }));
    const journal = await runConnectPipeline({
      profile: fakeProfile(),
      rawUrl: "https://acme.example.com",
      credentials: { token: "t" },
      workspaceId: "ws-1",
      actorId: "u-1",
      reachabilityCheck: vi.fn(async () => ({ status: "ok", detail: "ответил" })),
      persist
    });
    const steps = journal.steps.map((s) => `${s.step}:${s.status}`);
    expect(steps).toContain("verify_auth:ok");
    expect(steps).toContain("persist:ok");
    expect(persist).toHaveBeenCalledOnce();
    expect(journal.connected).toBe(true);
  });

  it("stops and does not persist when verify_auth fails", async () => {
    const persist = vi.fn();
    const journal = await runConnectPipeline({
      profile: fakeProfile({ verifyAuth: vi.fn(async () => ({ status: "failed", detail: "401", hint: "проверьте токен", authMode: "basic", secretSlots: [] })) }),
      rawUrl: "https://acme.example.com",
      credentials: { token: "bad" },
      workspaceId: "ws-1",
      actorId: "u-1",
      reachabilityCheck: vi.fn(async () => ({ status: "ok" })),
      persist
    });
    expect(persist).not.toHaveBeenCalled();
    expect(journal.connected).toBe(false);
    expect(journal.steps.find((s) => s.step === "verify_auth")?.status).toBe("failed");
  });

  it("persists with warning when test_import fails after verify ok", async () => {
    const journal = await runConnectPipeline({
      profile: fakeProfile({ testImport: vi.fn(async () => ({ status: "warning", detail: "не вышло" })) }),
      rawUrl: "https://acme.example.com",
      credentials: { token: "t" },
      testTicketId: "123",
      workspaceId: "ws-1",
      actorId: "u-1",
      reachabilityCheck: vi.fn(async () => ({ status: "ok" })),
      persist: vi.fn(async () => ({ integrationId: "int-1" }))
    });
    expect(journal.connected).toBe(true);
    expect(journal.steps.find((s) => s.step === "test_import")?.status).toBe("warning");
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/connect-orchestrator.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Реализовать конвейер**

`runConnectPipeline` принимает профиль + ввод + ИНЪЕКТИРУЕМЫЕ зависимости (`reachabilityCheck`, `persist`) — чтобы тестировать без сети/БД. Порядок: `validate_url` (normalizeUrl + assertPublicBaseUrl), `reachability` (инъекция), `auto_detect` (если profile.autoDetect — мёрджит config; warning не останавливает), `verify_auth` (failed → стоп, connected=false), `persist` (инъекция; пишет Integration active + secretSlots из verify), `test_import` (если profile.testImport и есть ticketId; warning не роняет connected). Каждый шаг кладёт `{ step, status, detail, hint }` в журнал. Возвращает `{ steps, connected, integrationId? }`. Фатальная ошибка reachability/validate → стоп, connected=false. Все строки detail/hint — RU.

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/unit/connect-orchestrator.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Коммит**

```bash
git add src/lib/integrations/connect/orchestrator.ts tests/unit/connect-orchestrator.test.ts
git commit -m "feat(connect): connectSource orchestration pipeline with step journal"
```

---

## Task 7: Server-action `connectSourceAction`

**Files:**
- Create: `src/lib/connect-actions.ts`
- Test: (action зависит от prisma/current-user — покрывается типами + e2e; отдельный юнит не обязателен)

- [ ] **Step 1: Реализовать action**

`"use server"`. Экспорт `connectSourceAction(prev, formData)` совместимый с `useActionState`, возвращает `ConnectJournalState = { steps; connected; integrationId? } | { error: string } | null`. Шаги:
1. `getCurrentUser()` + `canManageIntegrations(user.role)` (как в otrs-import-actions.ts) — иначе `{ error }`.
2. Прочитать из formData: `source`, `baseUrl` (или fixedBaseUrl профиля), `testTicketId` (опц.), и значения полей кредов по `profile.credentialFields[].key`.
3. `getConnectionProfile(source)` — иначе `{ error: "Неизвестный источник." }`.
4. Вызвать `runConnectPipeline({ profile, rawUrl, credentials, testTicketId, workspaceId: user.workspaceId, actorId: user.id, reachabilityCheck: defaultReachabilityCheck, persist: persistIntegration })`.
   - `defaultReachabilityCheck(baseUrl)`: лёгкий GET (fetch с таймаутом) → классификация (ответил/недоступен/TLS) + извлечение продукта из заголовка `x-powered-by` (OTRS). Реализуй здесь же, в серверном файле.
   - `persistIntegration(...)`: `prisma.$transaction` — upsert Integration по `workspaceId_source` (status `active`, baseUrl, authMode из verify, configJson из ctx.config) + `upsertIntegrationSecretSlot` по каждому secretSlot + `auditLog("integration.connected", ...)`. Верни `{ integrationId }`.
5. Вернуть журнал.

Сверь: `canManageIntegrations`, `getCurrentUser`, `upsertIntegrationSecretSlot` (kind, authMode, secret), `auditLog`, и существующий upsert Integration в integration-actions.ts (строки ~386/521 — `workspaceId_source` композитный ключ, поля create/update). Переиспользуй те же поля.

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit 2>&1 | grep -i "connect-actions" || echo ok`
Expected: ok.

- [ ] **Step 3: Коммит**

```bash
git add src/lib/connect-actions.ts
git commit -m "feat(connect): connectSourceAction server action with reachability + persist"
```

---

## Task 8: UI `ConnectSourceForm` + чек-лист

**Files:**
- Create: `src/components/integrations/connect-source-form.tsx`
- Test: `tests/unit/connect-source-form.test.tsx`

- [ ] **Step 1: Написать падающий рендер-тест**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectSourceForm } from "@/components/integrations/connect-source-form";

vi.mock("@/lib/connect-actions", () => ({ connectSourceAction: vi.fn(async () => null) }));

describe("ConnectSourceForm", () => {
  it("renders source tiles and a connect button", () => {
    render(<ConnectSourceForm sources={[{ source: "zendesk", label: "Zendesk", type: "native_helpdesk" }]} />);
    expect(screen.getByText("Zendesk")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Подключить/i })).toBeTruthy();
  });

  it("renders the step checklist from a journal state", () => {
    render(<ConnectSourceForm sources={[]} initialState={{ connected: true, steps: [
      { step: "verify_auth", status: "ok", detail: "вход выполнен" },
      { step: "persist", status: "ok", detail: "сохранено" }
    ] }} />);
    expect(screen.getByText(/вход выполнен/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/connect-source-form.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Реализовать компонент**

Клиент-компонент (`"use client"`). Props: `sources` (список плиток: source/label/type/limited?), необязательный `initialState` для теста. `useActionState(connectSourceAction, initialState ?? null)`. Состояние: выбранный source (плитки), URL (скрыто если профиль fixed — получи метаданные профиля через серверно-переданный пропс или статический список, БЕЗ импорта серверного реестра в клиент), значения полей кредов. Креды/поля рендерятся по метаданным выбранного источника (передай `credentialFields` и `urlPolicy`/`fixedBaseUrl`/`limited` как сериализуемый пропс `sources[i].fields` из серверной страницы — реестр НЕ импортируется в клиент). Кнопка «Подключить» сабмитит форму в action. Под формой — чек-лист: по `state.steps` рисуем шаги (✓/⚠/✗/спиннер) с detail и hint; шаги ещё не пришедшие — не показываем. Блок «Расширенные настройки» (`<details>`): если какой-то шаг `failed` и он из правимых (`auto_detect`/`verify_auth`), `<details open>` с подсказкой. Бейдж «ограниченная поддержка» для limited-источников. Строки — RU. Паттерн вывода — как в существующих формах (useActionState + useFormStatus pending).

ВАЖНО: реестр профилей серверный (тащит адаптеры/prisma). Клиент получает только сериализуемые метаданные. Серверная страница (Task 9) собирает `sources` из `listConnectionProfiles()` → `{ source, label, type, urlPolicy, fixedBaseUrl, fields: profile.credentialFields, limited: limitedSupportSources.has(source) }` и передаёт в компонент.

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/unit/connect-source-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/components/integrations/connect-source-form.tsx tests/unit/connect-source-form.test.tsx
git commit -m "feat(connect): ConnectSourceForm with live step checklist and manual fallback"
```

---

## Task 9: Подключить роут + e2e fixture

**Files:**
- Modify: `src/app/admin/integrations/new/page.tsx`
- Create: `tests/unit/connect-otrs-e2e.test.ts`

- [ ] **Step 1: Переключить страницу new на ConnectSourceForm**

В `src/app/admin/integrations/new/page.tsx`: серверный компонент собирает `sources` из `listConnectionProfiles()` (маппинг в сериализуемые метаданные, как в Task 8) и рендерит `<ConnectSourceForm sources={sources} />`. Сохрани существующую обвязку страницы (layout, заголовок, проверку прав через getCurrentUser/requireCurrentUserPermission, как было). Старый `IntegrationSetupWorkspace` импорт убери из этого роута (компонент пока остаётся в кодовой базе — удалим в Task 10).

- [ ] **Step 2: Написать e2e fixture-тест happy-path OTRS**

`tests/unit/connect-otrs-e2e.test.ts`: используя существующий фикстур-сервер GenericInterface (`tests/fixtures/otrs-genericinterface-server.ts`, см. как он поднимается в otrs-family-import-plan.test.ts), прогнать `runConnectPipeline` с `otrsConnectionProfile`, реальным baseUrl фикстур-сервера, валидными userLogin/password, инъектированным `reachabilityCheck` (ok) и `persist`-моком (захватывает аргументы). Проверить: журнал содержит `auto_detect:ok|warning`, `verify_auth:ok`, `persist:ok`; persist получил authMode `session` и secretSlot `auth_password`; connected=true. Это доказывает сквозную работу OTRS-профиля на реальном HTTP.

- [ ] **Step 3: Запустить**

Run: `npx vitest run tests/unit/connect-otrs-e2e.test.ts`
Expected: PASS.

- [ ] **Step 4: Коммит**

```bash
git add "src/app/admin/integrations/new/page.tsx" tests/unit/connect-otrs-e2e.test.ts
git commit -m "feat(connect): wire /admin/integrations/new to ConnectSourceForm + OTRS e2e fixture"
```

---

## Task 10: Полная верификация + удаление старого мастера

**Files:**
- Delete: `src/components/integrations/integration-setup-workspace.tsx` (только если ничего больше на него не ссылается)

- [ ] **Step 1: Полный прогон тестов**

Run: `npm run test`
Expected: все зелёные (887 существующих + новые).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: чисто, сборка успешна.

- [ ] **Step 3: Проверить отсутствие ссылок на старый мастер**

Run: `grep -rn "integration-setup-workspace\|IntegrationSetupWorkspace" src/ | grep -v "integration-setup-workspace.tsx"`
Expected: пусто. Если есть — оставить компонент и сообщить (не удалять). Если пусто — удалить файл.

- [ ] **Step 4: Коммит удаления (если применимо)**

```bash
git rm src/components/integrations/integration-setup-workspace.tsx
git commit -m "chore(connect): remove legacy 5-step setup wizard superseded by one-button connect"
```

- [ ] **Step 5: Завершение ветки**

Использовать `superpowers:finishing-a-development-branch` для merge/PR.

---

## Self-Review (заполнено при написании)

- **Покрытие спека:** профили+normalizeUrl (Task 1-5), оркестратор (Task 6), action+persist+reachability (Task 7), UI+чек-лист+fallback (Task 8), роут+e2e (Task 9), удаление мастера (Task 10). Probe-матрица реализована в профилях (Task 3-5). Две стадии — verify_auth + test_import в оркестраторе/профилях. Все секции спека покрыты.
- **Плейсхолдеры:** для повторяющихся helpdesk-источников применена фабрика `buildHelpdeskProfile` (DRY, не дублирование); data-source/enterprise/persist описаны достаточно для исполнителя с конкретными endpoint'ами и kind'ами слотов. Несколько мест помечены «сверь сигнатуру» — это намеренные verify-точки на реальный код, не placeholder логики.
- **Согласованность типов:** `SourceConnectionProfile`, `ConnectContext`, `VerifyResult.secretSlots[{kind,secret}]`, `ConnectStep{step,status,detail,hint}`, `runConnectPipeline({profile,rawUrl,credentials,testTicketId,workspaceId,actorId,reachabilityCheck,persist})`, `getConnectionProfile`/`listConnectionProfiles`/`limitedSupportSources`, `connectSourceAction` — имена согласованы между задачами.
- **Verify-точки для исполнителя:** (1) форма ответа `createHelpdeskHttpClient().requestJson` (statusCode/body/diagnostic, throw vs return на не-2xx); (2) `createHelpdeskAdapter(source)` сигнатура; (3) OTRS `createOtrsSession`/`parseOtrsConnectorConfig`/probeRoute адаптер (копия из detectOtrsRoutesAction); (4) data-source lightweight probe export; (5) Integration upsert поля и `workspaceId_source` ключ; (6) реестр профилей не должен попадать в клиентский бандл (метаданные сериализуются на серверной странице).
