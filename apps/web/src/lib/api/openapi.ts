export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Support QA Platform API",
      version: "1.0.0",
      description: "Backend API для ручного контроля качества ответов поддержки."
    },
    servers: [{ url: "/api/v1" }],
    security: [{ bearerApiToken: [] }],
    paths: {
      "/health": {
        get: {
          security: [],
          summary: "Проверка состояния backend и базы данных",
          responses: {
            "200": { description: "Сервис работает" },
            "503": { description: "Сервис частично недоступен" }
          }
        }
      },
      "/readiness": {
        get: {
          summary: "Readiness diagnostics: runtime config, queues, SSO and integrations",
          responses: {
            "200": { description: "Сервис готов или содержит предупреждения" }
          }
        }
      },
      "/me": {
        get: {
          summary: "Текущий пользователь и его разрешения",
          responses: {
            "200": { description: "Профиль текущего пользователя" },
            "401": { description: "Нет активной сессии" }
          }
        }
      },
      "/auth/providers": {
        get: {
          summary: "Провайдеры авторизации workspace и рекомендации AD/Entra",
          responses: {
            "200": { description: "Список провайдеров" },
            "403": { description: "Нет прав управления авторизацией" }
          }
        },
        post: {
          summary: "Создать или обновить провайдера SSO/AD",
          responses: {
            "201": { description: "Провайдер сохранен" },
            "400": { description: "Некорректный payload" }
          }
        }
      },
      "/auth/providers/{providerId}/mappings": {
        get: {
          summary: "Маппинги AD/Entra-групп в роли приложения",
          responses: {
            "200": { description: "Список маппингов" }
          }
        },
        post: {
          summary: "Создать или обновить маппинг группы в роль",
          responses: {
            "201": { description: "Маппинг сохранен" }
          }
        }
      },
      "/auth/sessions": {
        get: {
          summary: "Активные и исторические пользовательские сессии",
          responses: {
            "200": { description: "Список сессий" }
          }
        }
      },
      "/api-tokens": {
        get: {
          summary: "API-токены рабочего пространства",
          responses: {
            "200": { description: "Список API-токенов" }
          }
        },
        post: {
          summary: "Выпустить новый API-токен",
          responses: {
            "201": { description: "Токен создан, plainToken возвращается один раз" }
          }
        }
      },
      "/audit-logs": {
        get: {
          summary: "Журнал действий workspace с фильтрами и пагинацией",
          parameters: [
            { name: "action", in: "query", required: false },
            { name: "targetType", in: "query", required: false },
            { name: "targetId", in: "query", required: false },
            { name: "actorId", in: "query", required: false },
            { name: "from", in: "query", required: false },
            { name: "to", in: "query", required: false },
            { name: "page", in: "query", required: false },
            { name: "limit", in: "query", required: false }
          ],
          responses: {
            "200": { description: "Список событий аудита" },
            "403": { description: "Нет прав на просмотр аудита" }
          }
        }
      },
      "/integrations": {
        get: {
          summary: "Интеграции рабочего пространства",
          responses: {
            "200": { description: "Список интеграций" }
          }
        },
        post: {
          summary: "Создать или обновить интеграцию и ее секрет",
          responses: {
            "201": { description: "Интеграция сохранена" }
          }
        }
      },
      "/integrations/{integrationId}/imports": {
        post: {
          summary: "Поставить импорт интеграции в очередь",
          responses: {
            "202": { description: "IntegrationRun и BackendJob созданы" }
          }
        }
      },
      "/jobs": {
        get: {
          summary: "Фоновые задачи workspace",
          responses: {
            "200": { description: "Список задач" }
          }
        },
        post: {
          summary: "Создать фоновую задачу",
          responses: {
            "201": { description: "Задача создана" },
            "400": { description: "Некорректный payload" }
          }
        }
      },
      "/jobs/{jobId}": {
        get: {
          summary: "Детали фоновой задачи и журнал событий",
          responses: {
            "200": { description: "Карточка задачи" }
          }
        }
      },
      "/conversations": {
        get: {
          summary: "Список обращений workspace с фильтрами и пагинацией",
          parameters: [
            { name: "q", in: "query", required: false },
            { name: "qaStatus", in: "query", required: false },
            { name: "channel", in: "query", required: false },
            { name: "externalSource", in: "query", required: false },
            { name: "supportLine", in: "query", required: false },
            { name: "teamName", in: "query", required: false },
            { name: "qaAssigneeId", in: "query", required: false },
            { name: "openedFrom", in: "query", required: false },
            { name: "openedTo", in: "query", required: false },
            { name: "page", in: "query", required: false },
            { name: "limit", in: "query", required: false }
          ],
          responses: {
            "200": { description: "Список обращений" },
            "400": { description: "Некорректные фильтры" }
          }
        },
        post: {
          summary: "Импорт обращения из кастомной системы",
          parameters: [{ name: "Idempotency-Key", in: "header", required: false }],
          responses: {
            "201": { description: "Обращение импортировано" },
            "409": { description: "Конфликт idempotency key" }
          }
        }
      },
      "/reviews": {
        get: {
          summary: "Список проверок workspace с фильтрами и пагинацией",
          parameters: [
            { name: "q", in: "query", required: false },
            { name: "status", in: "query", required: false },
            { name: "reviewSource", in: "query", required: false },
            { name: "reviewerId", in: "query", required: false },
            { name: "conversationId", in: "query", required: false },
            { name: "externalSource", in: "query", required: false },
            { name: "minScore", in: "query", required: false },
            { name: "maxScore", in: "query", required: false },
            { name: "finalizedFrom", in: "query", required: false },
            { name: "finalizedTo", in: "query", required: false },
            { name: "page", in: "query", required: false },
            { name: "limit", in: "query", required: false }
          ],
          responses: {
            "200": { description: "Список проверок" },
            "400": { description: "Некорректные фильтры" }
          }
        }
      },
      "/conversations/{conversationId}": {
        get: {
          summary: "Детали обращения, сообщения и последние проверки",
          parameters: [
            { name: "conversationId", in: "path", required: true },
            { name: "messageLimit", in: "query", required: false }
          ],
          responses: {
            "200": { description: "Карточка обращения" },
            "404": { description: "Обращение не найдено" }
          }
        }
      },
      "/conversations/{conversationId}/events": {
        get: {
          summary: "История событий обращения в контуре проверки",
          responses: {
            "200": { description: "Список событий обращения" }
          }
        }
      },
      "/reviews/{reviewId}": {
        get: {
          summary: "Детали проверки, критерии, находки, обратная связь и события",
          responses: {
            "200": { description: "Карточка проверки" },
            "404": { description: "Проверка не найдена" }
          }
        }
      },
      "/reviews/{reviewId}/events": {
        get: {
          summary: "История событий проверки",
          responses: {
            "200": { description: "Список событий проверки" }
          }
        }
      },
      "/privacy/conversations/{conversationId}/redact": {
        post: {
          summary: "Маскирование персональных данных в обращении",
          responses: {
            "200": { description: "Обращение замаскировано" },
            "404": { description: "Обращение не найдено" }
          }
        }
      },
      "/reports/snapshots": {
        get: {
          summary: "Готовые снимки отчетности",
          responses: {
            "200": { description: "Список снимков" }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerApiToken: {
          type: "http",
          scheme: "bearer"
        }
      },
      schemas: {
        ApiError: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message", "details", "requestId"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: {},
                requestId: { type: "string" }
              }
            }
          }
        },
        PaginationMeta: {
          type: "object",
          required: ["page", "limit", "total", "totalPages", "hasNextPage", "hasPreviousPage"],
          properties: {
            page: { type: "integer", minimum: 1 },
            limit: { type: "integer", minimum: 1 },
            total: { type: "integer", minimum: 0 },
            totalPages: { type: "integer", minimum: 0 },
            hasNextPage: { type: "boolean" },
            hasPreviousPage: { type: "boolean" }
          }
        }
      }
    }
  };
}
