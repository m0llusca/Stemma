# Подключение источника «одной кнопкой» — дизайн

**Дата:** 2026-06-11
**Контекст:** Сейчас добавление источника — 5-шаговый мастер (`integration-setup-workspace.tsx`,
~1785 строк) с ручным вводом. Авто-определение есть только у OTRS (route-detection, webservice,
таймзона — построено в предыдущих итерациях). Цель — заменить мастер одно-кнопочным
авто-подключением: пользователь выбирает тип и вставляет ссылку, система определяет максимум
автоматически и просит креды/ID только когда они действительно нужны; UI показывает живой статус
и понятные подсказки при сбоях.

## Цель и принципы

- **Минимум ручной работы:** из вставленной ссылки выводим базовый URL, тип (по хосту),
  тестовый тикет (из пути); для OTRS — продукт по заголовкам, webservice, маршруты, таймзону.
- **Две стадии успеха:** (1) быстрый аутентифицированный probe «авторизация ok» → источник
  сразу `active`; (2) опциональный пробный импорт, если есть ID тикета.
- **Живой статус:** конвейер возвращает журнал шагов, UI рисует его чек-листом; каждый сбой —
  человеческая причина + действие, не stack trace.
- **Ручной fallback:** блок «Расширенные настройки» с полными полями; авто-раскрывается на том
  шаге, который правится руками.
- **Охват:** все источники (OTRS-family, helpdesk-API, data-source, enterprise). Enterprise
  получают форму + probe токена, но честный бейдж «ожидает живой сертификации».

## Scope

В scope: реестр профилей подключения, оркестратор `connectSource`, нормализация URL,
`verifyAuth` по источникам, новый UI `ConnectSourceForm` на месте `/admin/integrations/new`,
живой чек-лист, ручной fallback. Вне scope: OAuth redirect-потоки для enterprise (остаётся
client-credentials + бейдж ограничения); скачивание вложений; изменение страницы
`/admin/integrations/[id]` (диагностика/preview/история остаются).

---

## 1. Профили подключения и нормализация ввода

Новый реестр `apps/web/src/lib/integrations/connect/profiles/` — по файлу на источник +
`index.ts`-реестр. Интерфейс:

```ts
type CredentialField = {
  key: string;            // напр. "email", "apiToken", "password"
  label: string;          // RU
  placeholder?: string;
  format?: RegExp;        // инлайн-валидация формата до отправки
  hint?: string;          // где взять (RU)
  secret: boolean;        // маскировать ввод
};

type UrlHints = {
  basePath?: string;      // напр. "/otrs"
  testTicketId?: string;  // извлечён из пути ссылки
  detectedSource?: string;// подсказка типа по хосту
};

type SourceConnectionProfile = {
  source: string;
  type: "otrs_family" | "native_helpdesk" | "enterprise" | "data_source";
  urlPolicy: "required" | "fixed" | "optional";  // fixed → поле URL скрыто (intercom/hubspot)
  fixedBaseUrl?: string;                          // для urlPolicy: "fixed"
  hostPatterns?: RegExp[];                        // авто-подсказка типа по хосту
  normalizeUrl(raw: string): { baseUrl: string; hints?: UrlHints };
  credentialFields: CredentialField[];
  autoDetect?(ctx: ConnectContext): Promise<AutoDetectResult>;
  verifyAuth(ctx: ConnectContext): Promise<VerifyResult>;
  testImport?(ctx: ConnectContext): Promise<TestImportResult>;
};
```

**Нормализация URL** — выводит базу из любой ссылки helpdesk:
- `https://otrs.fsa.gov.ru/otrs/index.pl?Action=AgentDashboard` → база `https://otrs.fsa.gov.ru/otrs`, hint basePath `/otrs`;
- `https://acme.zendesk.com/agent/tickets/123` → база `https://acme.zendesk.com`, hint testTicketId `123`;
- `https://acme.atlassian.net/browse/SUP-42` → база + hint issue `SUP-42`.

**Подсказка типа по хосту:** `*.zendesk.com`, `*.freshdesk.com`, `*.atlassian.net`,
`*.service-now.com`, `*.crm.dynamics.com`, `*.salesforce.com` авто-предвыбирают плитку типа.
Self-hosted (OTRS/Jira Server) паттернами не ловятся — тип выбирает пользователь. Если URL
противоречит выбранному типу — мягкое предупреждение, не блокировка.

**Поля кредов:** Zendesk/Jira — email + API-токен (система сама склеит `email/token:value` /
`email:token`, пользователю формат знать не нужно); Intercom/HubSpot — один токен; OTRS —
логин + пароль; YDB — connection string + статические креды; YTsaurus — OAuth-токен.
Инлайн-валидация формата подсвечивает ошибку до отправки.

---

## 2. Оркестратор `connectSource` и поток данных

Модуль `apps/web/src/lib/integrations/connect/orchestrator.ts`; server-action — тонкая обёртка
(права как у прочих setup-действий: `canManageIntegrations`). Возвращает журнал шагов
`Array<{ step, status: "ok"|"warning"|"failed"|"skipped", detail?, hint? }>`.

Стадии:
1. **`validate_url`** — `normalizeUrl` + `assertPublicBaseUrl` (SSRF; hint про
   `QC_ALLOW_PRIVATE_BASE_URLS` для on-prem).
2. **`reachability`** — лёгкий неавторизованный GET базы: «не отвечает / TLS» (фатально, hint)
   vs «ответил»; обнаружение продукта по заголовкам (OTRS `X-Powered-By: OTRS 6.0.10`
   подтверждает тип+версию).
3. **`auto_detect`** (если профиль умеет) — OTRS: webservice + `detectOtrsRoutes` + таймзона
   (сверка наивного `Created` с epoch `IncomingTime` → авто `Europe/Moscow`/UTC). Результат →
   `configJson`. Иначе `skipped`.
4. **`verify_auth`** (стадия 1, критерий успеха) — дешёвый аутентифицированный probe.
5. **`persist`** — транзакционно: upsert `Integration` (status `active`) + зашифрованные
   secret-слоты + `configJson`. Идемпотентно по `workspaceId+source+baseUrl` (повторный
   connect обновляет, не дублирует).
6. **`test_import`** (стадия 2, опционально) — если есть ID тикета (введён или извлечён из
   ссылки): реальный `loadConversation`/TicketGet → нормализатор. Неуспех → `warning`
   (авторизация уже подтверждена), не `failed`.

**Безопасность:** probe переиспользуют существующие HTTP-клиенты (таймауты/лимиты/TLS); журнал
проходит через redaction-логику диагностики (секреты не утекают в `detail`). Частичный успех
сохраняется честно (verify_auth ok, test_import fail → `active` + warning, без отката).

**Переиспользование:** OTRS — `route-detection.ts` + `client.probeRoute` + диагностика;
helpdesk — `loadConversation` адаптеров + `createHelpdeskHttpClient`; SSRF — `net-guard`.
Новый код на источник — `verifyAuth` (1 endpoint) + `normalizeUrl`.

---

## 3. UI — страница подключения, живой чек-лист, fallback

`/admin/integrations/new` → одна страница с клиент-компонентом `ConnectSourceForm`
(новый, не наращиваем `integration-setup-workspace.tsx`):

1. **Плитки типов** (с бейджами сертификации; вставленный URL может авто-подсветить плитку).
2. **Поле URL** (скрыто для `urlPolicy: "fixed"`) + 2-3 поля кредов по профилю с инлайн-валидацией
   и подсказками.
3. **Кнопка «Подключить»**.

**Живой чек-лист:** после нажатия — вертикальный степпер из журнала шагов; невыполненные —
спиннер. Пример:
```
✓ Адрес проверен        https://otr…/otrs
✓ Сервер отвечает       OTRS 6.0.10 обнаружен
✓ Маршруты определены   TicketGet: GET /Ticket/{id}; таймзона: Europe/Moscow
✓ Авторизация           вход выполнен
✓ Источник подключён
◯ Пробный импорт        — укажите № тикета (необязательно)
```

**Подсказки при сбоях** (RU, из `hint`): «Сервер не ответил — проверьте адрес или firewall»;
«Авторизация отклонена (401) — проверьте токен/пароль»; «Маршрут поиска не найден — задайте
вручную в расширенных настройках».

**Ручной fallback:** раскрывающийся блок «Расширенные настройки» с полными полями (webservice,
переопределение маршрутов, auth-режим, таймзона, лимиты — переиспользует логику
`otrs-connection-form`). Авто-раскрывается на правимом руками шаге с подсветкой поля; данные
пройденных шагов не теряются.

**После успеха:** redirect на `/admin/integrations/[id]?section=operations` (без изменений).

---

## 4. Probe-матрица по источникам

| Источник | `verifyAuth` probe | Авто-определяется |
|---|---|---|
| OTRS/Znuny/OTOBO | SessionCreate (или TicketGet AuthFail→ok в credentials-режиме) | продукт по заголовку, webservice, маршруты, таймзона |
| Zendesk | `GET /api/v2/users/me.json` | поддомен, тестовый тикет из ссылки |
| Freshdesk | `GET /api/v2/agents/me` | поддомен, тикет из ссылки |
| Jira (JSM) | `GET /rest/api/2/myself` | хост, issue из `/browse/KEY-1` |
| Intercom | `GET /me` (+ Intercom-Version) | URL фиксирован — поле скрыто |
| HubSpot | `GET /account-info/v3/details` | URL фиксирован |
| YDB | короткий `SELECT 1` через клиент | формат connection string |
| YTsaurus | `GET /api/v3/get?path=//@` | — |
| Salesforce/ServiceNow/Dynamics | поля client-credentials + verify токен-эндпоинтом; бейдж «ограниченная поддержка» до live | instance-URL из ссылки |

Enterprise: форма + probe токена, но честный бейдж «ожидает живой сертификации» (нет live-доступов).

## Ошибки и частичный успех

Покрыто §2: журнал шагов с hint; `warning` для не-фатального; сохранение только после
`verify_auth`; авто-раскрытие «Расширенных настроек» на правимом шаге; redaction секретов.

## Тестовая стратегия

- **Юнит:** `normalizeUrl` всех профилей (ссылки на тикеты/дашборды → база+hints);
  классификация `verifyAuth` (200/401/404/timeout) на фейковом транспорте; оркестратор на
  фейковых профилях (порядок шагов, частичный успех, идемпотентный re-connect, redaction журнала).
- **Компонентный:** рендер чек-листа из журнала; авто-раскрытие fallback.
- **E2e fixture:** happy-path OTRS-профиля на существующем фикстур-сервере GenericInterface.
- Существующие 887 тестов не трогаем. `integration-setup-workspace.tsx` остаётся в кодовой базе
  до миграции роута, затем удаляется отдельным коммитом.

## Затрагиваемые файлы

**Создаются:**
- `apps/web/src/lib/integrations/connect/profiles/` (per-source + `index.ts` реестр)
- `apps/web/src/lib/integrations/connect/orchestrator.ts` (конвейер connectSource)
- `apps/web/src/lib/integrations/connect/types.ts` (SourceConnectionProfile и пр.)
- `apps/web/src/lib/integrations/connect/url-normalize.ts` (общие хелперы нормализации)
- `apps/web/src/lib/connect-actions.ts` (server-action обёртка, "use server")
- `apps/web/src/components/integrations/connect-source-form.tsx` (UI + чек-лист)
- тесты: профили, оркестратор, verifyAuth-классификация, компонент, e2e fixture

**Изменяются:**
- `apps/web/src/app/admin/integrations/new/page.tsx` — рендерит `ConnectSourceForm`
- helpdesk-адаптеры — добавить `verifyAuth`-эндпоинт (либо в профиле, либо тонкий метод адаптера)
- `apps/web/src/lib/integrations/otrs-family/*` — переиспользование detection (без изменения логики)

**Удаляется (отдельным финальным коммитом после миграции роута):**
- `apps/web/src/components/integrations/integration-setup-workspace.tsx`
