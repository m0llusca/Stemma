# OTRS-интеграция: доработка по результатам живого теста

**Дата:** 2026-06-11
**Ветка:** `feat/otrs-live-hardening`
**Контекст:** Живой прогон против `otrs.fsa.gov.ru` (OTRS Community Edition 6.0.10) подтвердил, что
основной путь импорта (TicketGet → нормализатор) работает корректно, но выявил три пробела:
непроверяемое UTC-допущение в датах, нестандартные маршруты GenericInterface на реальном
инстансе и отсутствие живой проверки сквозного импорта (проверяли только preview).

## Цель

Закрыть три пробела, не ломая существующее поведение интеграций (836 тестов зелёные,
дефолты сохраняют текущую логику):

1. Настраиваемая таймзона разбора дат OTRS.
2. Авто-определение маршрутов GenericInterface.
3. Сквозной e2e-импорт: регрессионный fixture-тест + один реальный прогон в dev-БД.

Вне scope: скачивание/хранение содержимого вложений (остаётся режим `external_links_only`);
авто-определение TicketSearch для последующего поиска по очереди не подразумевает изменения
логики самого поиска.

---

## 1. Настраиваемая таймзона дат

### Проблема
`parseOtrsDate` (`apps/web/src/lib/normalizers/otrs-family.ts:259`) для наивных дат вида
`YYYY-MM-DD HH:MM:SS` (формат GenericInterface без смещения) безусловно дописывает `Z`,
трактуя время как UTC. OTRS/Znuny/OTOBO возвращают время в настраиваемой `OTRSTimeZone`;
на не-UTC сервере (например, российский инстанс в Europe/Moscow) все `openedAt`/`sentAt`/
`closedAt` смещаются. Tz-библиотек в зависимостях нет.

### Решение
- **Конфиг.** В схему OTRS-коннектора (`apps/web/src/lib/integrations/otrs-family/config.ts`)
  добавить опциональное поле `timeZone: string` (IANA), дефолт `"UTC"`. Валидация — попыткой
  сконструировать `new Intl.DateTimeFormat("en-US", { timeZone })` в `superRefine`; при ошибке —
  понятное сообщение. `configVersion` остаётся `1`. Существующие сохранённые конфиги не
  мигрируются — дефолт `"UTC"` подставляется при парсинге, поведение для них не меняется.
- **Хелпер.** Новый `naiveOtrsDateToUtcIso(naive: string, timeZone: string): string` рядом с
  парсером. Для зоны вычисляет фактическое смещение на конкретную дату через
  `Intl.DateTimeFormat(..., { timeZone, ... }).formatToParts` (DST-корректно для зон с
  переходами; для Москвы офсет фиксированный +3) и переводит наивное локальное время в UTC ISO.
  Без новой зависимости.
- **Интеграция в парсер.** `parseOtrsDate(value, fallback, timeZone = "UTC")`:
  - даты, уже содержащие `Z` или `±HH:MM` — проходят как раньше (нетронуты);
  - числовой epoch (сек/мс) — как раньше;
  - наивные `YYYY-MM-DD HH:MM:SS` — через `naiveOtrsDateToUtcIso(value, timeZone)`.
  `timeZone` прокидывается из конфига через `normalizeOtrsFamilyTicketGetResponseForImport`
  в местах разбора статей/тикета.
- **UI.** В `apps/web/src/components/integrations/otrs-connection-form.tsx` добавить `<select>`
  с таймзоной (частые зоны РФ: Europe/Moscow, Europe/Kaliningrad, Asia/Yekaterinburg,
  Asia/Novosibirsk, Asia/Krasnoyarsk, Asia/Irkutsk, Asia/Vladivostok + UTC; дефолт UTC).
  Значение уходит в `configJson` тем же способом, что и прочие поля.

### Проверка
Юнит-тесты хелпера: UTC (no-op), Europe/Moscow (−3ч), зона с DST (например America/New_York,
проверка на летнюю/зимнюю дату), вход уже с offset (нетронут), epoch (нетронут).

---

## 2. Авто-определение маршрутов GenericInterface

### Проблема
На инстансе ФСА webservice называется `api` (не дефолтный `GenericTicketConnectorREST`), а
TicketSearch не привязан к `GET /Ticket` — маршруты настроены нестандартно. Форма уже умеет
ручной route-override (`routeOverridesEnabled`, method+path для TicketSearch/TicketGet,
webServiceName, auth-режим, sessionCreatePath), но админу приходится знать маршруты заранее.

### Ключевое наблюдение (подтверждено живыми пробами)
Ответы OTRS GenericInterface различимы и позволяют определить привязку маршрута **без
учётных данных**:
- маршрут НЕ привязан к операции → HTTP 500, тело `HTTP::REST Error while determine Operation for request URI '...'`;
- маршрут привязан, но нет авторизации → HTTP 200 с `{"Error":{"ErrorCode":"<Op>.AuthFail", ...}}`;
- SessionCreate с пустым телом → HTTP 500 `Unsupported request content structure` (маршрут есть);
- сетевые/TLS-ошибки — фатальны (продолжать пробы бессмысленно).

### Решение
- **Движок.** Новый модуль `apps/web/src/lib/integrations/otrs-family/route-detection.ts`,
  чистая функция `detectOtrsRoutes({ client, config, baseUrl, testTicketId })`:
  - **Матрица кандидатов** (фиксированная):
    - TicketGet: `GET /Ticket/{testId}`, `GET /TicketGet/{testId}`
    - TicketSearch: `GET /Ticket`, `POST /Ticket/Search`, `GET /TicketSearch`, `POST /TicketSearch`
    - SessionCreate: `POST /Session`, `POST /SessionCreate`
    Покрывает канонический OTRS 6 sample, Znuny, OTOBO и вариант «имя операции как путь» (ФСА).
  - **Классификатор** `classifyRouteProbe(response | error)`:
    `bound` (нашёлся operation-ответ/AuthFail/Unsupported-content) |
    `unbound` (Error while determine Operation) | `fatal` (сеть/TLS — прерывает весь прогон).
  - **Пробы без сессии и без подбора паролей.** TicketGet использует `testTicketId` (из формы
    или `"1"`). Определяем привязку маршрута, а не доступ.
  - **Результат:** `{ webServiceName, ticketGet?, ticketSearch?, sessionCreate?, undetected: string[] }`,
    где каждый найденный маршрут — `{ method, path }`; `undetected` — операции, по которым ни
    один кандидат не дал `bound`.
- **Server action** `detectOtrsRoutesAction(formData)` в
  `apps/web/src/lib/otrs-import-actions.ts`: читает baseUrl + webServiceName из формы, поднимает
  HTTP-клиент через `createOtrsHttpClient` (с таймаутами/TLS из конфига), зовёт движок, возвращает
  `{ ok, routes?, undetected?, error? }`. Требует право управления интеграциями (как остальные
  setup-действия). **Ничего не сохраняет** — только возвращает найденное.
- **UI.** Кнопка «Определить маршруты автоматически» в форме подключения. По клику результат
  пред-заполняет поля method+path (и включает `routeOverridesEnabled`, если найденное отличается
  от профиля). Админ видит подставленное и сохраняет сам — никакого молчаливого автосейва.
  Невыясненные маршруты подсвечиваются с подсказкой ввести вручную. Вывод ошибок — паттерн
  `useActionState`, русские сообщения, как в существующих формах.

### Проверка
Юнит-тесты движка на фейковом клиенте: классификатор по каждому типу ответа; матрица находит
ФСА-вариант (`GET /Ticket/{id}` для TicketGet, `POST /Session`, TicketSearch в `undetected`);
fatal-ошибка прерывает прогон; полностью пустой инстанс → всё в `undetected`.

---

## 3. Сквозной e2e-импорт

### 3a. Регрессионный fixture-тест (CI)
Новый `apps/web/tests/unit/otrs-import-e2e.test.ts`: синтетический ответ TicketGet,
повторяющий **структуру** реального тикета ФСА (14 статей, 2 приватные `IsVisibleForCustomer=0`,
7 вложений как внешние ссылки, наивные даты `YYYY-MM-DD HH:MM:SS`, статус с кириллицей) —
без реальных данных. Прогон полной цепочки:
`normalizeOtrsFamilyTicketGetResponseForImport({ timeZone: "Europe/Moscow" })` →
`upsertCustomConversation` (мок prisma по образцу `conversation-import` тестов). Проверки:
- создан Conversation c `qaStatus: QUEUED`;
- наивные времена сдвинуты на −3ч в UTC (например `2026-06-06 12:00:06` локального МСК →
  `2026-06-06T09:00:06.000Z`);
- 14 сообщений, 2 приватных, корректный participantMix;
- повторный прогон идемпотентен (upsert по externalId, без дублей).

### 3b. Живой прогон (ручная приёмка)
Расширить штатный `apps/web/src/scripts/otrs-live-smoke.ts`:
- поддержка `OTRS_SESSION_ID` — готовая сессия делает `OTRS_USER_LOGIN`/`OTRS_PASSWORD`
  необязательными (пробрасывается в `sessionIdForOperation` через `existingSessionId`,
  механизм уже есть);
- поддержка `OTRS_TIME_ZONE` (прокидывается в конфиг/нормализатор).
Прогон: `OTRS_LIVE_SMOKE=1 OTRS_LIVE_IMPORT=1` + локальная dev-БД + `OTRS_LIVE_WORKSPACE_ID` →
тикет `1549105` импортируется реально → проверка в UI `/reviews`, что обращение появилось,
времена совпадают с OTRS UI, статьи на месте. Реальные данные остаются только в локальной БД
(стираются `db:reset` или точечным delete). Содержимое тикета в логи/чат не выводится — только
структурные метрики.

### 3c. Приёмка таймзоны
Здесь закрывается открытый вопрос UTC vs локальное: сверка времени создания тикета в OTRS UI.
Если UI показывает 12:00 — сервер отдаёт UTC, дефолт верен; если 09:00 — выставляем
`Europe/Moscow` и проверяем, что в очереди время совпало с UI.

---

## Ошибки и тестовая стратегия (сквозное)

- Ошибки авто-определения — через существующие `OtrsConnectorError` (сетевые/TLS фатальны с
  `remediationHint`, как в диагностике).
- Все пользовательские строки — на русском.
- Новые/расширенные тесты (~5 файлов): хелпер таймзоны; классификатор + матрица route-detection;
  парсинг конфига с `timeZone`; форма — рендер-тест пред-заполнения; e2e fixture-тест.
- Дефолт `timeZone: "UTC"` гарантирует, что существующие 836 тестов и сохранённые конфиги
  сохраняют текущее поведение.

## Затрагиваемые файлы

**Изменяются:**
- `apps/web/src/lib/integrations/otrs-family/config.ts` — поле `timeZone` + валидация
- `apps/web/src/lib/normalizers/otrs-family.ts` — `parseOtrsDate` + хелпер таймзоны
- `apps/web/src/lib/integrations/otrs-family/normalization.ts` — проброс `timeZone`
- `apps/web/src/components/integrations/otrs-connection-form.tsx` — select таймзоны + кнопка авто-определения + пред-заполнение
- `apps/web/src/lib/otrs-import-actions.ts` — `detectOtrsRoutesAction`
- `apps/web/src/scripts/otrs-live-smoke.ts` — `OTRS_SESSION_ID`, `OTRS_TIME_ZONE`

**Создаются:**
- `apps/web/src/lib/integrations/otrs-family/route-detection.ts` — движок авто-определения
- `apps/web/tests/unit/otrs-import-e2e.test.ts` — регрессионный e2e
- тесты: route-detection, хелпер таймзоны (в существующих или новых файлах)
