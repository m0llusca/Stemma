# OTRS Live-Test Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать разбор дат OTRS таймзоно-зависимым, добавить авто-определение маршрутов GenericInterface и закрыть сквозной импорт регрессионным тестом плюс живым прогоном.

**Architecture:** Per-integration `timeZone` в конфиге OTRS-коннектора (дефолт `UTC`, поведение существующих конфигов не меняется); чистый Intl-хелпер конвертирует наивные даты в UTC; чистый движок `route-detection` пробирует матрицу кандидатов и классифицирует ответы GenericInterface по типу; server-action отдаёт найденные маршруты в форму без автосейва; e2e — fixture-тест полного пути `нормализатор → upsertCustomConversation` и расширение live-smoke под готовый `SessionID`.

**Tech Stack:** TypeScript, Next.js (App Router, server actions), Zod, Vitest, Prisma (мок в юнит-тестах). Без новых зависимостей — таймзона на `Intl.DateTimeFormat`.

**Рабочая директория всех путей:** `apps/web/` (например `src/lib/...` = `apps/web/src/lib/...`). Ветка `feat/otrs-live-hardening` уже создана.

---

## File Structure

**Создаются:**
- `src/lib/integrations/otrs-family/route-detection.ts` — чистый движок авто-определения маршрутов (матрица кандидатов + классификатор).
- `tests/unit/otrs-date-timezone.test.ts` — юнит-тесты Intl-хелпера и `parseOtrsDate` с таймзоной.
- `tests/unit/otrs-route-detection.test.ts` — юнит-тесты классификатора и матрицы на фейковом probe-клиенте.
- `tests/unit/otrs-import-e2e.test.ts` — регрессия полного пути импорта на синтетическом fixture.

**Изменяются:**
- `src/lib/normalizers/otrs-family.ts` — хелпер `naiveOtrsDateToUtcIso`, `parseOtrsDate(timeZone)`, проброс `timeZone` через `OtrsFamilyNormalizeOptions` в статьи/тикет.
- `src/lib/integrations/otrs-family/config.ts` — поле `timeZone` + валидация + дефолт.
- `src/lib/integrations/otrs-family/client.ts` — метод `probeRoute` (raw `{ statusCode, bodyText }`).
- `src/lib/integrations/runner.ts` — проброс `timeZone` из конфига в normalize.
- `src/lib/integrations/otrs-family/import-plan.ts` — проброс `timeZone` в `normalizeOtrsFamilyTicketForImport`.
- `src/lib/otrs-import-actions.ts` — `detectOtrsRoutesAction` + проброс `timeZone` в normalize.
- `src/app/api/integrations/otrs-family/tickets/route.ts` — проброс `timeZone`.
- `src/components/integrations/otrs-connection-form.tsx` — select таймзоны + кнопка «Определить маршруты» + пред-заполнение.
- `src/scripts/otrs-live-smoke.ts` — `OTRS_SESSION_ID`, `OTRS_TIME_ZONE`.

---

## Task 1: Intl-хелпер таймзоны + `parseOtrsDate(timeZone)`

**Files:**
- Modify: `src/lib/normalizers/otrs-family.ts` (функция `parseOtrsDate` ~строки 245-263)
- Test: `tests/unit/otrs-date-timezone.test.ts`

- [ ] **Step 1: Написать падающий тест**

Create `tests/unit/otrs-date-timezone.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { naiveOtrsDateToUtcIso, parseOtrsDate } from "@/lib/normalizers/otrs-family";

describe("naiveOtrsDateToUtcIso", () => {
  it("treats UTC as a no-op", () => {
    expect(naiveOtrsDateToUtcIso("2026-06-06T12:00:06", "UTC")).toBe("2026-06-06T12:00:06.000Z");
  });

  it("shifts Europe/Moscow wall-clock (-3h) to UTC", () => {
    expect(naiveOtrsDateToUtcIso("2026-06-06T12:00:06", "Europe/Moscow")).toBe("2026-06-06T09:00:06.000Z");
  });

  it("applies DST for a summer New York date (-4h)", () => {
    expect(naiveOtrsDateToUtcIso("2026-07-01T12:00:00", "America/New_York")).toBe("2026-07-01T16:00:00.000Z");
  });

  it("applies standard time for a winter New York date (-5h)", () => {
    expect(naiveOtrsDateToUtcIso("2026-01-15T12:00:00", "America/New_York")).toBe("2026-01-15T17:00:00.000Z");
  });
});

describe("parseOtrsDate timezone handling", () => {
  it("interprets a naive OTRS datetime in the given zone", () => {
    expect(parseOtrsDate("2026-06-06 12:00:06", new Date(0), "Europe/Moscow")).toBe("2026-06-06T09:00:06.000Z");
  });

  it("defaults to UTC when no zone is given (backward compatible)", () => {
    expect(parseOtrsDate("2026-06-06 12:00:06")).toBe("2026-06-06T12:00:06.000Z");
  });

  it("leaves a value that already has an offset untouched", () => {
    expect(parseOtrsDate("2026-06-06T12:00:06+03:00", new Date(0), "Europe/Moscow")).toBe("2026-06-06T09:00:06.000Z");
  });

  it("leaves a value that already has Z untouched", () => {
    expect(parseOtrsDate("2026-06-06T09:00:06Z", new Date(0), "Europe/Moscow")).toBe("2026-06-06T09:00:06.000Z");
  });

  it("passes numeric epoch seconds through unchanged regardless of zone", () => {
    expect(parseOtrsDate("0", new Date(0), "Europe/Moscow")).toBe("1970-01-01T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run tests/unit/otrs-date-timezone.test.ts`
Expected: FAIL — `naiveOtrsDateToUtcIso` не экспортируется; `parseOtrsDate` игнорирует третий аргумент.

- [ ] **Step 3: Добавить хелпер и расширить `parseOtrsDate`**

В `src/lib/normalizers/otrs-family.ts` добавить рядом с `parseOtrsDate` экспортируемый хелпер:

```ts
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts: Record<string, number> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - instant.getTime();
}

export function naiveOtrsDateToUtcIso(naive: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(naive);
  if (!match) {
    const fallback = new Date(`${naive}Z`);
    return Number.isNaN(fallback.getTime()) ? new Date(0).toISOString() : fallback.toISOString();
  }
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  // Two passes converge the zone offset for DST transitions; for fixed-offset
  // zones (e.g. Europe/Moscow) the first pass is already exact.
  let utc = guess - zoneOffsetMs(new Date(guess), timeZone);
  utc = guess - zoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc).toISOString();
}
```

Изменить сигнатуру и тело `parseOtrsDate`:

```ts
function parseOtrsDate(value: OtrsScalar, fallback = new Date(0), timeZone = "UTC") {
  const normalized = stringValue(value);

  if (!normalized) {
    return fallback.toISOString();
  }

  if (/^\d+$/.test(normalized)) {
    const numericValue = Number(normalized);
    const milliseconds = normalized.length <= 10 ? numericValue * 1000 : numericValue;
    return new Date(milliseconds).toISOString();
  }

  const isoLikeValue = normalized.includes("T") ? normalized : normalized.replace(" ", "T");

  if (/(Z|[+-]\d{2}:\d{2})$/.test(isoLikeValue)) {
    const date = new Date(isoLikeValue);
    return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
  }

  const iso = naiveOtrsDateToUtcIso(isoLikeValue, timeZone);
  return Number.isNaN(Date.parse(iso)) ? fallback.toISOString() : iso;
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npx vitest run tests/unit/otrs-date-timezone.test.ts`
Expected: PASS (10 тестов).

- [ ] **Step 5: Коммит**

```bash
git add src/lib/normalizers/otrs-family.ts tests/unit/otrs-date-timezone.test.ts
git commit -m "feat(otrs): timezone-aware date parsing via Intl helper"
```

---

## Task 2: Проброс `timeZone` через нормализатор

**Files:**
- Modify: `src/lib/normalizers/otrs-family.ts` (тип `OtrsFamilyNormalizeOptions` ~220; `normalizeOtrsFamilyTicket` ~373; `normalizeOtrsFamilyArticle` ~357)
- Test: `tests/unit/otrs-date-timezone.test.ts` (дополнить)

- [ ] **Step 1: Дописать падающий тест end-to-end нормализации**

Добавить в `tests/unit/otrs-date-timezone.test.ts`:

```ts
import { normalizeOtrsFamilyTicket } from "@/lib/normalizers/otrs-family";

describe("normalizeOtrsFamilyTicket timezone threading", () => {
  const ticket = {
    TicketID: "1549105",
    TicketNumber: "2026060610000063",
    Title: "Тест",
    State: "open",
    Created: "2026-06-06 12:00:06",
    Article: [
      {
        ArticleID: "1",
        From: "customer@example.com",
        SenderType: "customer",
        Body: "Текст",
        Created: "2026-06-06 12:00:06",
        IsVisibleForCustomer: "1"
      }
    ]
  };

  it("applies the configured timezone to ticket and article timestamps", () => {
    const conversation = normalizeOtrsFamilyTicket(ticket, { source: "otrs", timeZone: "Europe/Moscow" });
    expect(conversation.openedAt).toBe("2026-06-06T09:00:06.000Z");
    expect(conversation.messages[0].sentAt).toBe("2026-06-06T09:00:06.000Z");
  });

  it("defaults to UTC when timeZone is omitted", () => {
    const conversation = normalizeOtrsFamilyTicket(ticket, { source: "otrs" });
    expect(conversation.openedAt).toBe("2026-06-06T12:00:06.000Z");
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/otrs-date-timezone.test.ts -t "timezone threading"`
Expected: FAIL — `openedAt` приходит `12:00:06Z` (timeZone не прокинут).

- [ ] **Step 3: Прокинуть `timeZone` в нормализаторе**

В `src/lib/normalizers/otrs-family.ts`:

1. Добавить поле в тип (`OtrsFamilyNormalizeOptions`):

```ts
export type OtrsFamilyNormalizeOptions = {
  source?: OtrsFamilySource;
  baseUrl?: string;
  samplingReason?: string;
  timeZone?: string;
};
```

2. Изменить сигнатуру `normalizeOtrsFamilyArticle`, чтобы принимать таймзону:

```ts
export function normalizeOtrsFamilyArticle(article: OtrsFamilyArticle, index = 0, timeZone = "UTC"): CustomMessageInput {
  const externalId =
    stringValue(article.ArticleID) ?? stringValue(article.ArticleNumber) ?? `article-${String(index + 1).padStart(3, "0")}`;
  const sentAt = parseOtrsDate(article.Created ?? article.CreateTime ?? article.IncomingTime, new Date(index), timeZone);
  const senderType = participantType(article);

  return {
    externalId,
    participantType: senderType,
    authorName: stringValue(article.From) ?? stringValue(article.SenderType) ?? "OTRS",
    body: stringValue(article.Body) ?? stringValue(article.Text) ?? stringValue(article.Subject) ?? "Без текста",
    sentAt,
    isPrivate: !isVisibleForCustomer(article.IsVisibleForCustomer)
  };
}
```

3. В `normalizeOtrsFamilyTicket` прочитать таймзону и прокинуть во все вызовы `parseOtrsDate` и в маппинг статей. Заменить начало тела функции:

```ts
export function normalizeOtrsFamilyTicket(
  ticket: OtrsFamilyTicket,
  options: OtrsFamilyNormalizeOptions = {}
): CustomConversationInput {
  const timeZone = options.timeZone ?? "UTC";
  const articles = arrayValue(ticket.Article).sort((left, right) => {
    const leftTime = new Date(parseOtrsDate(left.Created ?? left.CreateTime ?? left.IncomingTime, new Date(0), timeZone)).getTime();
    const rightTime = new Date(parseOtrsDate(right.Created ?? right.CreateTime ?? right.IncomingTime, new Date(0), timeZone)).getTime();
    return leftTime - rightTime;
  });
  const messages = articles.map((article, index) => normalizeOtrsFamilyArticle(article, index, timeZone));
  const ticketId = stringValue(ticket.TicketID);
  const ticketNumber = stringValue(ticket.TicketNumber);
  const priority = stringValue(ticket.Priority);
  const createdAt = parseOtrsDate(ticket.Created ?? ticket.CreateTime, messages[0] ? new Date(messages[0].sentAt) : new Date(0), timeZone);
  const closedAt = ticket.Closed || ticket.ClosedTime ? parseOtrsDate(ticket.Closed ?? ticket.ClosedTime, new Date(0), timeZone) : null;
  // ...остальное тело без изменений
```

(Остальная часть функции — `firstCustomerMessage`, `return {...}` — не меняется. `createdAt`/`closedAt` уже использовались в `openedAt`/`closedAt` полях.)

- [ ] **Step 4: Запустить тесты нормализатора**

Run: `npx vitest run tests/unit/otrs-date-timezone.test.ts tests/unit/otrs-family-normalizer.test.ts`
Expected: PASS. Если в `otrs-family-normalizer.test.ts` есть тесты, ожидавшие `12:00Z` для наивной даты без timeZone — они должны остаться зелёными (дефолт UTC). Если какой-то тест явно передавал наивную дату и проверял старое поведение — оно не изменилось (без timeZone = UTC).

- [ ] **Step 5: Коммит**

```bash
git add src/lib/normalizers/otrs-family.ts tests/unit/otrs-date-timezone.test.ts
git commit -m "feat(otrs): thread timeZone option through ticket/article normalization"
```

---

## Task 3: Поле `timeZone` в конфиге коннектора

**Files:**
- Modify: `src/lib/integrations/otrs-family/config.ts` (`rawConfigSchema` ~46+, `superRefine` ~109, `transform` ~123)
- Test: `tests/unit/otrs-family-config.test.ts` (дополнить; найти точное имя — `ls tests/unit | grep otrs-family-config`)

- [ ] **Step 1: Дописать падающий тест**

Добавить в `tests/unit/otrs-family-config.test.ts`:

```ts
describe("timeZone config", () => {
  it("defaults timeZone to UTC", () => {
    const config = parseOtrsConnectorConfig({ product: "otrs_ce_6" });
    expect(config.timeZone).toBe("UTC");
  });

  it("accepts a valid IANA timezone", () => {
    const config = parseOtrsConnectorConfig({ product: "otrs_ce_6", timeZone: "Europe/Moscow" });
    expect(config.timeZone).toBe("Europe/Moscow");
  });

  it("rejects an invalid timezone", () => {
    expect(() => parseOtrsConnectorConfig({ product: "otrs_ce_6", timeZone: "Mars/Phobos" })).toThrow();
  });
});
```

(Убедиться, что `parseOtrsConnectorConfig` импортирован в этом тест-файле; если нет — добавить импорт из `@/lib/integrations/otrs-family/config`.)

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/otrs-family-config.test.ts -t "timeZone"`
Expected: FAIL — `config.timeZone` undefined; невалидная зона не отклоняется.

- [ ] **Step 3: Добавить поле, валидацию и дефолт**

В `src/lib/integrations/otrs-family/config.ts`:

1. В `rawConfigSchema` (объект с `connector`, `configVersion`, ...) добавить поле:

```ts
    timeZone: z.string().trim().min(1).optional(),
```

2. В `.superRefine((value, ctx) => { ... })` добавить проверку валидности зоны (рядом с проверкой route overrides):

```ts
    if (value.timeZone) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value.timeZone });
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Некорректная таймзона OTRS: ${value.timeZone}.`,
          path: ["timeZone"]
        });
      }
    }
```

3. В `.transform((value) => { return { ... } })` добавить в возвращаемый объект:

```ts
      timeZone: value.timeZone ?? "UTC",
```

- [ ] **Step 4: Запустить тесты конфига**

Run: `npx vitest run tests/unit/otrs-family-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/integrations/otrs-family/config.ts tests/unit/otrs-family-config.test.ts
git commit -m "feat(otrs): add validated timeZone field to connector config (default UTC)"
```

---

## Task 4: Проброс `config.timeZone` в местах импорта

**Files:**
- Modify: `src/lib/integrations/runner.ts` (~173), `src/lib/integrations/otrs-family/import-plan.ts` (~571), `src/lib/otrs-import-actions.ts` (~83), `src/app/api/integrations/otrs-family/tickets/route.ts` (~94)
- Test: `tests/unit/otrs-import-e2e.test.ts` покроет это в Task 9 (отдельный тест здесь не требуется — изменения механические, проверяются типами и e2e)

- [ ] **Step 1: runner — пробросить timeZone**

В `src/lib/integrations/runner.ts`, в `loadOtrsFamilyConversations`, в объект опций `normalizeOtrsFamilyTicketGetResponseForImport` (~строка 173) добавить `timeZone: connectorConfig.timeZone`:

```ts
  const normalizedTickets = normalizeOtrsFamilyTicketGetResponseForImport(payload as OtrsFamilyTicketGetResponse, {
    source,
    baseUrl,
    timeZone: connectorConfig.timeZone,
    samplingReason: `Импорт ${config.sourceLabel ?? integration.displayName}: TicketGet ${ticketId}.`
  });
```

(`connectorConfig` уже есть в области видимости — `parseOtrsConnectorConfig(integration.configJson)`.)

- [ ] **Step 2: import-plan — пробросить timeZone**

В `src/lib/integrations/otrs-family/import-plan.ts` найти вызов `normalizeOtrsFamilyTicketForImport(ticket, { ... })` (~строка 571). Установить, доступен ли распарсенный конфиг в этой функции; если в области есть `config` коннектора — добавить `timeZone: config.timeZone`. Если конфиг не распарсен в этой точке — распарсить через `parseOtrsConnectorConfig` от конфигурации интеграции, которая уже передаётся в `createPreviewItemForTicketId` (проверить параметры функции: `input.integration.configJson` или аналог), и передать `timeZone`. Конкретно:

```ts
    const normalized = normalizeOtrsFamilyTicketForImport(ticket, {
      source,
      baseUrl,
      timeZone,
      // ...существующие опции
    });
```

где `timeZone` берётся из уже доступного распарсенного конфига коннектора в этой функции (тот же объект, из которого берутся routes/limits для запроса). Если такого объекта нет — добавить параметр `timeZone: string` в сигнатуру `createPreviewItemForTicketId`/вызывающую функцию и прокинуть из места, где конфиг парсится.

- [ ] **Step 3: otrs-import-actions — пробросить timeZone**

В `src/lib/otrs-import-actions.ts` найти `normalizeOtrsFamilyTicket(ticket, options)` (~строка 83). В объект `options` добавить `timeZone` из распарсенного конфига коннектора (тот же, из которого формируется запрос). Если конфиг парсится выше в функции — `timeZone: connectorConfig.timeZone`; иначе распарсить `parseOtrsConnectorConfig(integration.configJson)` и взять `.timeZone`.

- [ ] **Step 4: tickets route — пробросить timeZone**

В `src/app/api/integrations/otrs-family/tickets/route.ts` (~строка 94) в `options` для `normalizeOtrsFamilyTicket` добавить `timeZone` из конфига коннектора интеграции (распарсить `parseOtrsConnectorConfig` от `integration.configJson`, если ещё не распарсен в этом хендлере).

- [ ] **Step 5: Проверить типы и существующие тесты**

Run: `npx vitest run tests/unit/otrs-family-import-plan.test.ts tests/unit/integration-actions-otrs.test.ts && npx tsc --noEmit`
Expected: PASS, типы чистые. Дефолт `timeZone: "UTC"` означает, что поведение этих тестов не меняется.

- [ ] **Step 6: Коммит**

```bash
git add src/lib/integrations/runner.ts src/lib/integrations/otrs-family/import-plan.ts src/lib/otrs-import-actions.ts "src/app/api/integrations/otrs-family/tickets/route.ts"
git commit -m "feat(otrs): pass connector timeZone into all import normalization sites"
```

---

## Task 5: Низкоуровневый `probeRoute` в HTTP-клиенте

**Files:**
- Modify: `src/lib/integrations/otrs-family/client.ts` (тип `OtrsHttpClient` ~27, `createOtrsHttpClient` ~52-78)
- Test: покрывается в Task 6 через фейковый клиент; прямой тест клиента не обязателен (тонкая обёртка над существующим транспортом)

- [ ] **Step 1: Добавить тип результата и метод в интерфейс**

В `src/lib/integrations/otrs-family/client.ts` расширить тип `OtrsHttpClient`:

```ts
export type OtrsRouteProbeResult = {
  statusCode: number;
  bodyText: string;
};

export type OtrsHttpClient = {
  requestJson: (operationRequest: OtrsOperationRequest) => Promise<unknown>;
  probeRoute: (operationRequest: OtrsOperationRequest) => Promise<OtrsRouteProbeResult>;
};
```

- [ ] **Step 2: Реализовать `probeRoute`**

`probeRoute` выполняет тот же низкоуровневый транспорт, что и `requestJson`, но НЕ бросает на не-2xx и НЕ парсит JSON — возвращает сырые `{ statusCode, bodyText }`. Реализация переиспользует внутренний транспорт (`nodeTransport`/`request`), который уже возвращает `statusCode` и тело. Внутри `createOtrsHttpClient` вернуть дополнительно:

```ts
  return {
    requestJson: (operationRequest) =>
      requestJson(operationRequest, runtime),
    probeRoute: async (operationRequest) => {
      const transportRequest = toTransportRequest(operationRequest, input);
      const response = await sendOtrsTransportRequest(transportRequest, runtime);
      return {
        statusCode: response.statusCode,
        bodyText: response.body.toString("utf8")
      };
    }
  };
```

Имена `toTransportRequest` / `sendOtrsTransportRequest` — это уже существующие внутренние шаги, которые `requestJson` выполняет перед проверкой статуса (определить их точные имена, прочитав `requestJson`, ~строки 80-150, и переиспользовать те же функции построения транспорт-запроса и отправки). Если транспорт инкапсулирован внутри `requestJson` и не вынесен — вынести построение запроса + отправку в локальную функцию `sendRaw(operationRequest, runtime): Promise<{ statusCode: number; body: Buffer }>` и вызвать её и из `requestJson`, и из `probeRoute` (DRY). `probeRoute` НЕ применяет лимит `response_too_large` агрессивно — но переиспользует тот же транспорт; тела ошибок GenericInterface малы.

- [ ] **Step 3: Проверить типы и существующие тесты клиента**

Run: `npx vitest run tests/unit/otrs-family-client.test.ts && npx tsc --noEmit`
Expected: PASS — `requestJson` поведение не изменилось, добавлен `probeRoute`.

- [ ] **Step 4: Коммит**

```bash
git add src/lib/integrations/otrs-family/client.ts
git commit -m "feat(otrs): add raw probeRoute to HTTP client for route detection"
```

---

## Task 6: Движок авто-определения маршрутов

**Files:**
- Create: `src/lib/integrations/otrs-family/route-detection.ts`
- Test: `tests/unit/otrs-route-detection.test.ts`

- [ ] **Step 1: Написать падающий тест классификатора и матрицы**

Create `tests/unit/otrs-route-detection.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { classifyRouteProbe, detectOtrsRoutes } from "@/lib/integrations/otrs-family/route-detection";

describe("classifyRouteProbe", () => {
  it("marks 'determine Operation' as unbound", () => {
    expect(
      classifyRouteProbe({ statusCode: 500, bodyText: "HTTP::REST Error while determine Operation for request URI '/Ticket'." })
    ).toBe("unbound");
  });

  it("marks an AuthFail JSON body as bound", () => {
    expect(
      classifyRouteProbe({ statusCode: 200, bodyText: '{"Error":{"ErrorMessage":"TicketGet: Authorization failing!","ErrorCode":"TicketGet.AuthFail"}}' })
    ).toBe("bound");
  });

  it("marks 'Unsupported request content structure' as bound", () => {
    expect(classifyRouteProbe({ statusCode: 500, bodyText: "Unsupported request content structure." })).toBe("bound");
  });

  it("marks an ordinary operation JSON response as bound", () => {
    expect(classifyRouteProbe({ statusCode: 200, bodyText: '{"TicketID":["1"]}' })).toBe("bound");
  });
});

describe("detectOtrsRoutes", () => {
  it("detects the FSA-style instance (TicketGet on /Ticket/:id, SessionCreate on /Session, TicketSearch undetected)", async () => {
    const probeRoute = vi.fn(async (request: { operation: string; method: string; url: string }) => {
      if (request.url.includes("/Ticket/")) {
        return { statusCode: 200, bodyText: '{"Error":{"ErrorCode":"TicketGet.AuthFail"}}' };
      }
      if (request.url.endsWith("/Session")) {
        return { statusCode: 500, bodyText: "Unsupported request content structure." };
      }
      return { statusCode: 500, bodyText: "HTTP::REST Error while determine Operation for request URI '...'." };
    });

    const result = await detectOtrsRoutes({
      probeRoute,
      baseUrl: "https://otrs.example.ru/otrs",
      webServiceName: "api",
      testTicketId: "1"
    });

    expect(result.ticketGet).toEqual({ method: "GET", path: "/Ticket/{TicketID}" });
    expect(result.sessionCreate).toEqual({ method: "POST", path: "/Session" });
    expect(result.undetected).toContain("ticketSearch");
  });

  it("aborts on a fatal transport error", async () => {
    const probeRoute = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    await expect(
      detectOtrsRoutes({ probeRoute, baseUrl: "https://x/otrs", webServiceName: "api", testTicketId: "1" })
    ).rejects.toThrow();
  });

  it("reports everything undetected for an empty webservice", async () => {
    const probeRoute = vi.fn(async () => ({ statusCode: 500, bodyText: "Error while determine Operation for request URI '...'." }));
    const result = await detectOtrsRoutes({ probeRoute, baseUrl: "https://x/otrs", webServiceName: "api", testTicketId: "1" });
    expect(result.undetected.sort()).toEqual(["sessionCreate", "ticketGet", "ticketSearch"]);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/otrs-route-detection.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Реализовать движок**

Create `src/lib/integrations/otrs-family/route-detection.ts`:

```ts
import { buildOtrsWebServiceBaseUrl } from "@/lib/integrations/otrs-family/config";

export type RouteProbeResponse = { statusCode: number; bodyText: string };
export type RouteProbeClassification = "bound" | "unbound";

export type DetectedRoute = { method: "GET" | "POST"; path: string };

export type OtrsRouteDetectionResult = {
  webServiceName: string;
  ticketGet?: DetectedRoute;
  ticketSearch?: DetectedRoute;
  sessionCreate?: DetectedRoute;
  undetected: string[];
};

type RouteCandidate = { method: "GET" | "POST"; path: string };

const CANDIDATES: Record<"ticketGet" | "ticketSearch" | "sessionCreate", RouteCandidate[]> = {
  ticketGet: [
    { method: "GET", path: "/Ticket/{TicketID}" },
    { method: "GET", path: "/TicketGet/{TicketID}" }
  ],
  ticketSearch: [
    { method: "GET", path: "/Ticket" },
    { method: "POST", path: "/Ticket/Search" },
    { method: "GET", path: "/TicketSearch" },
    { method: "POST", path: "/TicketSearch" }
  ],
  sessionCreate: [
    { method: "POST", path: "/Session" },
    { method: "POST", path: "/SessionCreate" }
  ]
};

export function classifyRouteProbe(response: RouteProbeResponse): RouteProbeClassification {
  if (/determine Operation/i.test(response.bodyText)) {
    return "unbound";
  }
  return "bound";
}

export async function detectOtrsRoutes(input: {
  probeRoute: (request: { operation: string; method: "GET" | "POST"; url: string }) => Promise<RouteProbeResponse>;
  baseUrl: string;
  webServiceName: string;
  testTicketId: string;
}): Promise<OtrsRouteDetectionResult> {
  const serviceBase = buildOtrsWebServiceBaseUrl({ baseUrl: input.baseUrl, webServiceName: input.webServiceName });
  const result: OtrsRouteDetectionResult = { webServiceName: input.webServiceName, undetected: [] };

  for (const operation of ["sessionCreate", "ticketGet", "ticketSearch"] as const) {
    let found: DetectedRoute | undefined;
    for (const candidate of CANDIDATES[operation]) {
      const path = candidate.path.replace("{TicketID}", encodeURIComponent(input.testTicketId));
      const response = await input.probeRoute({ operation, method: candidate.method, url: `${serviceBase}${path}` });
      if (classifyRouteProbe(response) === "bound") {
        found = { method: candidate.method, path: candidate.path };
        break;
      }
    }
    if (found) {
      result[operation] = found;
    } else {
      result.undetected.push(operation);
    }
  }

  return result;
}
```

Примечание: фатальные ошибки (исключения из `probeRoute` — сеть/TLS) пробрасываются наверх естественно, т.к. `await` не обёрнут в try/catch — это и есть требуемое «aborts on a fatal transport error».

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/unit/otrs-route-detection.test.ts`
Expected: PASS (8 тестов).

- [ ] **Step 5: Коммит**

```bash
git add src/lib/integrations/otrs-family/route-detection.ts tests/unit/otrs-route-detection.test.ts
git commit -m "feat(otrs): route auto-detection engine with probe classifier"
```

---

## Task 7: Server action `detectOtrsRoutesAction`

**Files:**
- Modify: `src/lib/otrs-import-actions.ts`
- Test: дополнить `tests/unit/otrs-route-detection.test.ts` или новый — но action зависит от prisma/current-user; ограничиться проверкой типов и ручной проверкой в e2e. Юнит-тест action не обязателен (тонкая обёртка); движок уже покрыт.

- [ ] **Step 1: Реализовать action**

В `src/lib/otrs-import-actions.ts` (файл с `"use server"`) добавить экспортируемую функцию. Использовать существующие helpers этого файла для авторизации (тот же guard, что и в `importOtrsFamilyTicketGet`: `getCurrentUser` + `canManageIntegrations`/`assertCanPersistSettings`) и построения клиента. Сигнатура и тело:

```ts
import { createOtrsHttpClient } from "@/lib/integrations/otrs-family/client";
import { parseOtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import { detectOtrsRoutes, type OtrsRouteDetectionResult } from "@/lib/integrations/otrs-family/route-detection";

export type DetectOtrsRoutesState =
  | { ok: true; result: OtrsRouteDetectionResult }
  | { ok: false; message: string }
  | null;

export async function detectOtrsRoutesAction(_prev: DetectOtrsRoutesState, formData: FormData): Promise<DetectOtrsRoutesState> {
  const user = await getCurrentUser();
  if (!canManageIntegrations(user)) {
    return { ok: false, message: "Недостаточно прав для определения маршрутов." };
  }

  const baseUrl = String(formData.get("baseUrl") ?? "").trim();
  if (!baseUrl) {
    return { ok: false, message: "Укажите Base URL источника." };
  }
  const webServiceName = String(formData.get("webServiceName") ?? "").trim() || "GenericTicketConnectorREST";
  const testTicketId = String(formData.get("testTicketId") ?? "").trim() || "1";

  const config = parseOtrsConnectorConfig({ webServiceName });
  const client = createOtrsHttpClient({ config, baseUrl, userLogin: "", password: "" });

  try {
    const result = await detectOtrsRoutes({
      probeRoute: (request) => client.probeRoute({ operation: request.operation as never, method: request.method, url: request.url, mode: request.method === "POST" ? "post_json" : "get_query", body: request.method === "POST" ? "{}" : undefined } as never),
      baseUrl,
      webServiceName,
      testTicketId
    });
    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Не удалось определить маршруты." };
  }
}
```

ВАЖНО: точную форму `OtrsOperationRequest`, которую ожидает `client.probeRoute`, нужно проверить в `src/lib/integrations/otrs-family/requests.ts` (`OtrsOperationRequest` — поля `operation/method/url/mode/body`). Привести аргумент `probeRoute` к этому типу без `as never`, если структура совпадает. Цель: `probeRoute` шлёт сырой GET (без тела) или POST с телом `{}` на сформированный URL.

- [ ] **Step 2: Проверить guard-функции и типы**

Сверить имена `getCurrentUser`, `canManageIntegrations` с тем, как они импортируются и используются в начале `otrs-import-actions.ts` (строки 5-10 уже импортируют `assertCanPersistSettings, canManageIntegrations, getCurrentUser`). Использовать тот же паттерн авторизации, что и соседние actions.

Run: `npx tsc --noEmit`
Expected: чисто (без `as never`, если типы совпали; иначе минимально адаптировать построение `OtrsOperationRequest`).

- [ ] **Step 3: Коммит**

```bash
git add src/lib/otrs-import-actions.ts
git commit -m "feat(otrs): detectOtrsRoutesAction server action"
```

---

## Task 8: UI — select таймзоны + кнопка авто-определения

**Files:**
- Modify: `src/components/integrations/otrs-connection-form.tsx`
- Test: `tests/unit/otrs-connection-form.test.tsx` (создать, если нет — проверить `ls tests/unit | grep otrs-connection`)

- [ ] **Step 1: Написать падающий рендер-тест**

Create/extend `tests/unit/otrs-connection-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OtrsConnectionForm } from "@/components/integrations/otrs-connection-form";
import { buildDefaultOtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";

describe("OtrsConnectionForm", () => {
  const baseProps = {
    integration: { id: "i1", baseUrl: "https://otrs.example.ru/otrs", displayName: "OTRS", source: "otrs" } as never,
    config: buildDefaultOtrsConnectorConfig(),
    userLogin: "agent",
    credentials: []
  };

  it("renders a timezone select with UTC default", () => {
    render(<OtrsConnectionForm {...baseProps} />);
    const select = screen.getByLabelText(/Таймзона/i) as HTMLSelectElement;
    expect(select.value).toBe("UTC");
  });

  it("renders the auto-detect routes button", () => {
    render(<OtrsConnectionForm {...baseProps} />);
    expect(screen.getByRole("button", { name: /Определить маршруты/i })).toBeTruthy();
  });
});
```

(Сверить точную форму props `OtrsConnectionForm` — `integration`, `config`, `userLogin`, `credentials` — по объявлению `OtrsConnectionFormProps` в компоненте, и подогнать `baseProps`.)

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/otrs-connection-form.test.tsx`
Expected: FAIL — нет select таймзоны и кнопки.

- [ ] **Step 3: Добавить select таймзоны**

В `src/components/integrations/otrs-connection-form.tsx`:

1. Добавить состояние и список зон рядом с другими `useState`:

```tsx
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
// ...внутри компонента:
const [timeZone, setTimeZone] = useState(config.timeZone ?? "UTC");
```

2. Включить `timeZone` в формирование `configJson`. Найти функцию `routeConfigJson` (~строка 52) и место, где собирается итоговый объект конфига для скрытого поля `configJson` (~строка 115). Добавить `timeZone` в этот объект:

```tsx
  return JSON.stringify({
    ...config,
    timeZone,
    advanced: { ...config.advanced, routeOverridesEnabled },
    ...(routeOverridesEnabled ? { routes } : {})
  });
```

(адаптировать под фактическую сигнатуру `routeConfigJson` — передать `timeZone` параметром, либо включить в объект на месте сборки скрытого input.)

3. Добавить разметку select рядом с полем webServiceName:

```tsx
<label className={labelClass}>
  Таймзона OTRS-сервера
  <select className={fieldClass} value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>
    {OTRS_TIME_ZONES.map((zone) => (
      <option key={zone} value={zone}>{zone}</option>
    ))}
  </select>
</label>
```

(Использовать те же классы `labelClass`/`fieldClass`, что и соседние поля формы.)

- [ ] **Step 4: Добавить кнопку авто-определения и пред-заполнение**

Подключить `useActionState` к `detectOtrsRoutesAction` и кнопку, которая шлёт `baseUrl` + `webServiceName` текущей формы. При успешном результате — записать найденные method/path в соответствующие состояния (`setTicketSearchMethod`, `setTicketSearchPath`, `setTicketGetMethod`, `setTicketGetPath`) и включить `setRouteOverridesEnabled(true)`, если найденное отличается от профиля; невыясненные — показать подсказкой. Минимальная реализация:

```tsx
import { useActionState, useEffect } from "react";
import { detectOtrsRoutesAction, type DetectOtrsRoutesState } from "@/lib/otrs-import-actions";
// ...
const [detectState, detectAction, detecting] = useActionState<DetectOtrsRoutesState, FormData>(detectOtrsRoutesAction, null);

useEffect(() => {
  if (detectState?.ok) {
    const { ticketGet, ticketSearch } = detectState.result;
    if (ticketGet) { setTicketGetMethod(ticketGet.method); setTicketGetPath(ticketGet.path); }
    if (ticketSearch) { setTicketSearchMethod(ticketSearch.method); setTicketSearchPath(ticketSearch.path); }
    if (ticketGet || ticketSearch) { setRouteOverridesEnabled(true); }
  }
}, [detectState]);
```

Кнопка (внутри секции маршрутов; своя `<form action={detectAction}>` или кнопка с `formAction`, передающая `baseUrl`/`webServiceName` скрытыми input'ами):

```tsx
<form action={detectAction} className="...">
  <input type="hidden" name="baseUrl" value={integration.baseUrl ?? ""} />
  <input type="hidden" name="webServiceName" value={webServiceName} />
  <button type="submit" disabled={detecting} className="...">
    {detecting ? "Определяем..." : "Определить маршруты автоматически"}
  </button>
  {detectState?.ok === false ? <p className="text-[#b91c1c]">{detectState.message}</p> : null}
  {detectState?.ok && detectState.result.undetected.length > 0 ? (
    <p className="...">Не определены: {detectState.result.undetected.join(", ")} — введите вручную.</p>
  ) : null}
</form>
```

ВАЖНО: `webServiceName` в форме — это значение input `name="webServiceName"` (~строка 138). Если оно сейчас неуправляемое (`defaultValue`), завести для него состояние `const [webServiceName, setWebServiceName] = useState(config.webServiceName)` и сделать input управляемым, чтобы кнопка слала актуальное имя. Вложенная `<form>` внутри основной формы недопустима в HTML — вынести кнопку определения в отдельную форму ВНЕ основной `<form>` (например, над ней) или использовать `formAction` на кнопке, указывающий на отдельный action, не сабмитящий основную форму. Предпочтительно: разместить блок авто-определения как отдельную `<form action={detectAction}>` над основной формой подключения.

- [ ] **Step 5: Запустить рендер-тест**

Run: `npx vitest run tests/unit/otrs-connection-form.test.tsx`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add src/components/integrations/otrs-connection-form.tsx tests/unit/otrs-connection-form.test.tsx
git commit -m "feat(otrs): timezone select and auto-detect routes button in connection form"
```

---

## Task 9: Регрессионный e2e-тест полного пути импорта

**Files:**
- Create: `tests/unit/otrs-import-e2e.test.ts`

- [ ] **Step 1: Изучить мок prisma в существующих тестах conversation-import**

Прочитать `tests/unit/` на предмет существующего теста `upsertCustomConversation` (например `grep -rln "upsertCustomConversation" tests/`), чтобы повторить форму мок-клиента prisma (`conversation.upsert`, `message.upsert`/`createMany`, `samplingRule.findMany`). Использовать ту же форму мока.

- [ ] **Step 2: Написать e2e-тест на синтетическом fixture**

Create `tests/unit/otrs-import-e2e.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { normalizeOtrsFamilyTicketGetResponseForImport } from "@/lib/integrations/otrs-family/normalization";
import { upsertCustomConversation } from "@/lib/conversation-import";
import { customConversationSchema } from "@/lib/validation/custom-api";

function fsaShapedTicket() {
  const articles = Array.from({ length: 14 }, (_, i) => ({
    ArticleID: String(i + 1),
    From: i % 2 === 0 ? "customer@fsa.example" : "agent@fsa.example",
    SenderType: i % 2 === 0 ? "customer" : "agent",
    Body: `Сообщение ${i + 1}`,
    Created: "2026-06-06 12:00:06",
    IsVisibleForCustomer: i < 2 ? "0" : "1"
  }));
  return {
    TicketGet: {
      Ticket: [
        {
          TicketID: "1549105",
          TicketNumber: "2026060610000063",
          Title: "Тестовое обращение",
          State: "Ожидает решения разработчика (ФАУ НИА)",
          Queue: "Поддержка",
          Created: "2026-06-06 12:00:06",
          Article: articles
        }
      ]
    }
  };
}

describe("OTRS import end-to-end (fixture)", () => {
  it("normalizes with Moscow timezone and persists a queued conversation", async () => {
    const normalized = normalizeOtrsFamilyTicketGetResponseForImport(fsaShapedTicket() as never, {
      source: "otrs",
      baseUrl: "https://otrs.example.ru/otrs",
      timeZone: "Europe/Moscow"
    });

    expect(normalized).toHaveLength(1);
    const { conversation } = normalized[0];
    expect(conversation.openedAt).toBe("2026-06-06T09:00:06.000Z");
    expect(conversation.messages).toHaveLength(14);
    expect(conversation.messages.filter((m) => m.isPrivate)).toHaveLength(2);

    const parsed = customConversationSchema.parse(conversation);

    const upserted: Record<string, unknown> = {};
    const tx = {
      conversation: {
        upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
          Object.assign(upserted, create);
          return { id: "conv-1", ...create };
        }),
        findUnique: vi.fn(async () => null)
      },
      message: {
        upsert: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({ count: 0 }))
      },
      samplingRule: { findMany: vi.fn(async () => []) }
    };

    const result = await upsertCustomConversation("workspace-1", parsed, tx as never, { samplingRules: [] });

    expect(result.externalId).toBe("1549105");
    expect(upserted.qaStatus).toBe("QUEUED");
    expect(tx.message.upsert).toHaveBeenCalledTimes(14);
  });
});
```

ВАЖНО: точную форму мок-`tx` (имена полей в `conversation.upsert`, наличие `qaStatus` в `create`, способ записи сообщений — `message.upsert` в цикле против `createMany`) сверить с реальной реализацией `upsertCustomConversation` (`src/lib/conversation-import.ts`) и существующим тестом этого модуля; подогнать ассерты под фактическое поведение (например, если `qaStatus` ставится через отдельное поле или сообщения пишутся `createMany` — поправить число вызовов/ассерты). Цель теста: доказать, что полный путь даёт queued-конверсацию с 14 сообщениями, 2 приватными и временами, сдвинутыми на московскую зону.

- [ ] **Step 3: Запустить тест**

Run: `npx vitest run tests/unit/otrs-import-e2e.test.ts`
Expected: PASS (после подгонки мок-формы под реальный `upsertCustomConversation`).

- [ ] **Step 4: Коммит**

```bash
git add tests/unit/otrs-import-e2e.test.ts
git commit -m "test(otrs): end-to-end import regression on FSA-shaped fixture"
```

---

## Task 10: live-smoke — `OTRS_SESSION_ID` и `OTRS_TIME_ZONE`

**Files:**
- Modify: `src/scripts/otrs-live-smoke.ts` (`buildRuntime` ~148-200; типы `SmokeRuntime` ~22; вызовы `sessionIdForOperation`)

- [ ] **Step 1: Сделать логин-пароль необязательными при наличии SessionID**

В `buildRuntime`:
- заменить `requiredEnv("OTRS_USER_LOGIN")`/`requiredEnv("OTRS_PASSWORD")` на чтение через optional-хелпер, если задан `OTRS_SESSION_ID`:

```ts
  const existingSessionId = process.env.OTRS_SESSION_ID?.trim();
  const userLogin = existingSessionId ? (process.env.OTRS_USER_LOGIN?.trim() ?? "") : requiredEnv("OTRS_USER_LOGIN");
  const password = existingSessionId ? (process.env.OTRS_PASSWORD?.trim() ?? "") : requiredEnv("OTRS_PASSWORD");
```

- добавить `existingSessionId` и `timeZone` в `SmokeRuntime` и в возвращаемый объект:

```ts
    timeZone: process.env.OTRS_TIME_ZONE?.trim() || config.timeZone,
    existingSessionId
```

(добавить соответствующие поля `timeZone: string; existingSessionId?: string;` в тип `SmokeRuntime`.)

- если задан `OTRS_TIME_ZONE`, прокинуть его в `parseOtrsConnectorConfig({ ..., timeZone: process.env.OTRS_TIME_ZONE })`, чтобы конфиг нёс таймзону.

- [ ] **Step 2: Прокинуть SessionID и timeZone в операции**

Во всех вызовах `sessionIdForOperation({...})` в этом скрипте добавить `existingSessionId: runtime.existingSessionId`. Во всех вызовах `normalizePreview`/`normalizeOtrsFamilyTicketGetResponseForImport` добавить `timeZone: runtime.timeZone` в опции normalize.

- [ ] **Step 3: Проверить типы**

Run: `npx tsc --noEmit`
Expected: чисто.

- [ ] **Step 4: Коммит**

```bash
git add src/scripts/otrs-live-smoke.ts
git commit -m "feat(otrs): live-smoke accepts OTRS_SESSION_ID and OTRS_TIME_ZONE"
```

---

## Task 11: Полная верификация и живой прогон

**Files:** —

- [ ] **Step 1: Полный прогон тестов**

Run: `npm run test`
Expected: все зелёные (836 существующих + новые).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: чисто.

- [ ] **Step 3: Живой прогон (ручная приёмка — выполняет оператор)**

Подготовить локальную dev-БД (`docker compose up -d postgres`, `npm run db:deploy`, `npm run db:seed`), узнать `OTRS_LIVE_WORKSPACE_ID` (id демо-workspace из seed). Получить свежий `SessionID` (POST /Session на стороне оператора). Затем:

```bash
OTRS_LIVE_SMOKE=1 OTRS_LIVE_IMPORT=1 \
OTRS_BASE_URL="https://otrs.fsa.gov.ru/otrs" \
OTRS_WEBSERVICE_NAME="api" \
OTRS_SESSION_ID="<свежий SessionID>" \
OTRS_TICKET_GET_AUTH="session" \
OTRS_TEST_TICKET_ID="1549105" \
OTRS_TIME_ZONE="Europe/Moscow" \
OTRS_LIVE_WORKSPACE_ID="<id workspace>" \
DATABASE_URL="<локальный dev DATABASE_URL>" \
npm run test:otrs:live
```

Expected: импорт успешен; в UI `/reviews` появляется обращение 1549105; время создания совпадает с тем, что показывает OTRS UI (см. шаг 4). Содержимое тикета в чат не выводить.

- [ ] **Step 4: Приёмка таймзоны**

Сверить время создания тикета в OTRS UI (AgentTicketZoom для 1549105) с временем в очереди `/reviews`. Если совпадает с `Europe/Moscow` — таймзона верна; если сервер на самом деле отдаёт UTC, выставить `OTRS_TIME_ZONE=UTC` (и в настройке интеграции — `timeZone: UTC`) и перепроверить. Зафиксировать вывод в финальном сообщении.

- [ ] **Step 5: Финальный обзорный код-ревью и завершение ветки**

Использовать `superpowers:finishing-a-development-branch` для merge/PR.

---

## Self-Review (заполняется при написании плана)

- **Покрытие спека:** таймзона (Task 1-4), авто-определение маршрутов (Task 5-8), e2e fixture (Task 9) + live (Task 10-11), UI (Task 8). Все секции спека отражены.
- **Плейсхолдеры:** код приведён для всех логических шагов; механические проброски (Task 4) описаны пофайлово с конкретными строками — намеренно без дублирования одинакового кода, т.к. это однотипная правка опций.
- **Согласованность типов:** `OtrsRouteDetectionResult`, `DetectedRoute`, `classifyRouteProbe`, `detectOtrsRoutes`, `probeRoute`, `naiveOtrsDateToUtcIso`, `parseOtrsDate(value, fallback, timeZone)`, `OtrsFamilyNormalizeOptions.timeZone`, `config.timeZone` — имена согласованы между задачами.
- **Риск-замечания для исполнителя:** (1) точная форма `OtrsOperationRequest` для `probeRoute` — сверить с `requests.ts`; (2) форма мок-`tx` для `upsertCustomConversation` — сверить с реальной реализацией; (3) вложенные `<form>` в Task 8 недопустимы — блок авто-определения отдельной формой.
