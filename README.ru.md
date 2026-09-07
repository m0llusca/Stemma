# Stemma

**Язык:** [English](README.md) | **Русский**

**Omnichannel QA Hub** для контроля качества поддержки — ревью, scorecards, интеграции, сигналы коучинга и доказательства сертификации.

Интерфейс продукта на русском (`КК поддержки`). Стек: Next.js App Router, React 19, Prisma / PostgreSQL, Vitest, Playwright, shadcn/ui.

Репозиторий: [github.com/m0llusca/Stemma](https://github.com/m0llusca/Stemma)

## Возможности

- Ревью качества и scorecards (балльная оценка)
- Адаптеры импорта из helpdesk / CRM (Zendesk, Freshdesk, Intercom, HubSpot, Jira, Salesforce, ServiceNow, Dynamics, OTRS/Znuny/OTOBO)
- Импорт из источников данных (YDB со static / IAM token / ключами сервисного аккаунта Yandex Cloud, YTsaurus)
- Корпоративная идентичность (OIDC, SAML, LDAPS) и ссылки на секреты
- Cockpit интеграций с готовностью к сертификации и gated live smoke
- Админка: пользователи, права, внешний вид, интеграции
- Воркер фоновых задач (`npm run jobs:run`)

## Требования

- Node.js **22+** (в CI используется 22; локально 20.19+ может подойти для YDB SDK)
- Docker (PostgreSQL через Compose)
- npm

## Быстрый старт

```bash
git clone https://github.com/m0llusca/Stemma.git
cd Stemma

# База данных
docker compose up -d postgres

# Приложение
cd apps/web
cp .env.example .env
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000). Локальная авторизация по умолчанию берётся из demo seed (см. вывод seed / документацию).

PostgreSQL слушает **localhost:55432** (`qc_app` / `qc_app` / база `qc_app`).

## Скрипты (`apps/web`)

| Команда | Назначение |
| --- | --- |
| `npm run dev` | Dev-сервер Next.js |
| `npm run build` / `npm start` | Production-сборка |
| `npm run typecheck` | Prisma generate + TypeScript |
| `npm test` | Unit / API тесты (Vitest) |
| `npm run test:integration` | Интеграционные тесты с БД |
| `npm run test:e2e` | Playwright |
| `npm run db:deploy` / `db:seed` | Миграции + demo seed |
| `npm run jobs:run` | Обработка фоновых задач |
| `npm run test:otrs:live` | Gated live smoke для OTRS |
| `npm run test:live:data-source` | Gated live smoke для YDB / YTsaurus |

Live-наборы остаются **fail-closed**: нужны явные `*_LIVE_SMOKE=1` и credentials. См. `docs/otrs-live-smoke.md` и `apps/web/tests/live/`.

## Структура проекта

```
Stemma/
├── apps/web/          # Next.js-приложение, Prisma, тесты
├── compose.yaml       # Локальный PostgreSQL
├── docs/              # Операционные заметки, планы, спецификации
└── .github/workflows/ # CI + защищённые live smoke workflows
```

## Конфигурация

Скопируйте `apps/web/.env.example` → `apps/web/.env`. Минимум:

- `DATABASE_URL` — строка подключения Prisma
- `QC_PUBLIC_ORIGIN` / `QC_PUBLIC_ORIGIN_ALLOWLIST` — публичный origin для auth / ссылок

Секреты интеграций должны использовать зашифрованные payload'ы `v1:` или ссылки `env:` (см. `apps/web/src/lib/auth/secret-refs.ts`). Не коммитьте `.env` и ключи сервисных аккаунтов.

## Документация

- [OTRS live smoke](docs/otrs-live-smoke.md)
- [Планирование jobs](docs/jobs-scheduling.md)
- [Контракты установки интеграций](docs/integration-install-contracts.md)
- [Операции](docs/operations/)
- Планы дизайна / реализации в `docs/superpowers/`

## Заметки для разработки

- UI-система: **shadcn/ui** (Base UI, `base-nova`) — см. `docs/memory/shadcn-ui-knowledge.md`
- Подсказки для агентов в этом репозитории: `AGENTS.md`
- Graphify / Lazyweb / личные research-дампы остаются в gitignore

## Лицензия

MIT — см. [LICENSE](LICENSE).

## Безопасность

Уязвимости сообщайте приватно — см. [SECURITY.md](SECURITY.md).
