# Stemma

**Язык:** [English](README.md) · Русский

Stemma — хаб контроля качества поддержки. Забирает диалоги из хелпдесков и источников данных, оценивает их по чек-листам, помогает коучить операторов и хранит, что именно вы сертифицировали.

Интерфейс на русском (`КК поддержки`). Стек: Next.js, React 19, Prisma, PostgreSQL.

Репозиторий: [github.com/m0llusca/Stemma](https://github.com/m0llusca/Stemma)

## Что умеет

- Ревью и чек-листы (балльная оценка)
- Импорт из Zendesk, Freshdesk, Intercom, HubSpot, Jira, Salesforce, ServiceNow, Dynamics, OTRS / Znuny / OTOBO
- Импорт из YDB и YTsaurus (статический ключ, IAM-токен или сервисный аккаунт Yandex Cloud)
- Вход через OIDC, SAML, LDAPS; секреты — через зашифрованные ссылки
- Панель интеграций: проверка готовности и живые smoke-тесты по явному флагу
- Админка: пользователи, права, внешний вид, интеграции
- Фоновые задачи: `npm run jobs:run`

## Что нужно

- Node.js 22+ (как в CI; локально для YDB часто хватает 20.19+)
- Docker
- npm

## Быстрый старт

```bash
git clone https://github.com/m0llusca/Stemma.git
cd Stemma

docker compose up -d postgres

cd apps/web
cp .env.example .env
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000). Демо-пользователи создаются сидом — email смотрите в выводе `db:seed`.

Postgres: `localhost:55432`, логин / пароль / база — `qc_app`.

## Команды (`apps/web`)

| Команда | Зачем |
| --- | --- |
| `npm run dev` | Локальный сервер |
| `npm run build` · `npm start` | Прод-сборка и запуск |
| `npm run typecheck` | Prisma generate + TypeScript |
| `npm test` | Юнит- и API-тесты |
| `npm run test:integration` | Тесты на Postgres |
| `npm run test:e2e` | Playwright |
| `npm run db:deploy` · `db:seed` | Миграции и демо-данные |
| `npm run jobs:run` | Обработать очередь задач |
| `npm run test:otrs:live` | Живой smoke OTRS (по флагу) |
| `npm run test:live:data-source` | Живой smoke YDB / YTsaurus (по флагу) |

Живые smoke по умолчанию выключены: нужны `*_LIVE_SMOKE=1` и настоящие учётные данные. Подробности: `docs/otrs-live-smoke.md`, `apps/web/tests/live/`.

## Структура

```
Stemma/
├── apps/web/           # Приложение, Prisma, тесты
├── compose.yaml        # Локальный Postgres
├── docs/               # Операционка и спецификации
└── .github/workflows/  # CI и защищённые live smoke
```

## Настройка

Скопируйте `apps/web/.env.example` → `apps/web/.env`. Минимум:

- `DATABASE_URL` — строка подключения к Postgres
- `QC_PUBLIC_ORIGIN` и `QC_PUBLIC_ORIGIN_ALLOWLIST` — публичный URL для входа и ссылок

Секреты интеграций храните как шифротекст `v1:` или ссылку `env:` (`apps/web/src/lib/auth/secret-refs.ts`). Файл `.env` и ключи сервисных аккаунтов в git не кладите.

## Документация

- [OTRS live smoke](docs/otrs-live-smoke.md)
- [Playwright verify DB](docs/e2e-verify-database.md)
- [Расписание задач](docs/jobs-scheduling.md)
- [Контракты установки интеграций](docs/integration-install-contracts.md)
- [Операции](docs/operations/)

UI-кит: shadcn/ui (Base UI, `base-nova`) — `docs/memory/shadcn-ui-knowledge.md`. Заметки для агентов: `AGENTS.md`.

## Лицензия и безопасность

MIT — [LICENSE](LICENSE).

Уязвимости сообщайте приватно — [SECURITY.md](SECURITY.md).
