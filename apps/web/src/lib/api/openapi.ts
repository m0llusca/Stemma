export function buildOpenApiDocument() {
  const bearerSecurity = [{ bearerApiToken: [] }];
  const sessionSecurity = [{ sessionCookie: [] }];
  const noSecurity: [] = [];

  return {
    openapi: "3.1.0",
    info: {
      title: "Support QA Platform API",
      version: "1.0.0",
      description: "Backend API для ручного контроля качества ответов поддержки."
    },
    servers: [{ url: "/api/v1" }],
    paths: {
      "/health": {
        get: {
          security: noSecurity,
          summary: "Проверка состояния backend и базы данных",
          responses: {
            "200": { description: "Сервис работает" },
            "503": { description: "Сервис частично недоступен" }
          }
        }
      },
      "/openapi": {
        get: {
          security: noSecurity,
          summary: "OpenAPI document for the public and admin API surface",
          responses: {
            "200": { description: "OpenAPI 3.1 документ" }
          }
        }
      },
      "/readiness": {
        get: {
          security: sessionSecurity,
          summary: "Readiness diagnostics: runtime config, queues, SSO and integrations",
          responses: {
            "200": { description: "Сервис готов или содержит предупреждения" }
          }
        }
      },
      "/me": {
        get: {
          security: sessionSecurity,
          summary: "Текущий пользователь и его разрешения",
          responses: {
            "200": { description: "Профиль текущего пользователя" },
            "401": { description: "Нет активной сессии" }
          }
        }
      },
      "/auth/providers": {
        get: {
          security: sessionSecurity,
          summary: "Провайдеры авторизации workspace и рекомендации AD/Entra",
          responses: {
            "200": { description: "Список провайдеров" },
            "403": { description: "Нет прав управления авторизацией" }
          }
        },
        post: {
          security: sessionSecurity,
          summary: "Создать или обновить провайдера SSO/AD",
          responses: {
            "201": { description: "Провайдер сохранен" },
            "400": { description: "Некорректный payload" }
          }
        }
      },
      "/auth/providers/{providerId}": {
        patch: {
          security: sessionSecurity,
          summary: "Обновить настройки провайдера SSO/AD",
          responses: {
            "200": { description: "Провайдер обновлен" },
            "404": { description: "Провайдер не найден" }
          }
        }
      },
      "/auth/providers/{providerId}/mappings": {
        get: {
          security: sessionSecurity,
          summary: "Маппинги AD/Entra-групп в роли приложения",
          responses: {
            "200": { description: "Список маппингов" }
          }
        },
        post: {
          security: sessionSecurity,
          summary: "Создать или обновить маппинг группы в роль",
          responses: {
            "201": { description: "Маппинг сохранен" }
          }
        }
      },
      "/auth/providers/{providerId}/sync": {
        post: {
          security: sessionSecurity,
          summary: "Поставить синхронизацию провайдера авторизации в очередь",
          responses: {
            "202": { description: "Задача синхронизации создана" },
            "404": { description: "Провайдер не найден" }
          }
        }
      },
      "/auth/sessions": {
        get: {
          security: sessionSecurity,
          summary: "Активные и исторические пользовательские сессии",
          responses: {
            "200": { description: "Список сессий" }
          }
        }
      },
      "/auth/sessions/{sessionId}/revoke": {
        post: {
          security: sessionSecurity,
          summary: "Отозвать пользовательскую сессию",
          responses: {
            "200": { description: "Сессия отозвана" },
            "404": { description: "Сессия не найдена" }
          }
        }
      },
      "/api-tokens": {
        get: {
          security: sessionSecurity,
          summary: "API-токены рабочего пространства",
          responses: {
            "200": { description: "Список API-токенов" }
          }
        },
        post: {
          security: sessionSecurity,
          summary: "Выпустить новый API-токен",
          responses: {
            "201": { description: "Токен создан, plainToken возвращается один раз" }
          }
        }
      },
      "/api-tokens/{tokenId}/revoke": {
        post: {
          security: sessionSecurity,
          summary: "Отозвать API-токен workspace",
          responses: {
            "200": { description: "Токен отозван" },
            "404": { description: "Токен не найден" }
          }
        }
      },
      "/audit-logs": {
        get: {
          security: sessionSecurity,
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
          security: sessionSecurity,
          summary: "Интеграции рабочего пространства",
          responses: {
            "200": { description: "Список интеграций" }
          }
        },
        post: {
          security: sessionSecurity,
          summary: "Создать или обновить интеграцию и ее секрет",
          responses: {
            "201": { description: "Интеграция сохранена" }
          }
        }
      },
      "/integrations/catalog": {
        get: {
          security: sessionSecurity,
          summary: "Каталог поддерживаемых коннекторов, capability manifest и webhook events",
          responses: {
            "200": { description: "Connector capability catalog" }
          }
        }
      },
      "/integrations/{integrationId}/imports": {
        post: {
          security: sessionSecurity,
          summary: "Поставить импорт интеграции в очередь",
          responses: {
            "202": { description: "IntegrationRun и BackendJob созданы" }
          }
        }
      },
      "/webhook-endpoints": {
        get: {
          security: sessionSecurity,
          summary: "Webhook endpoints рабочего пространства",
          responses: {
            "200": {
              description: "Список inbound webhook endpoints",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["webhookEndpoints"],
                    properties: {
                      webhookEndpoints: {
                        type: "array",
                        items: { $ref: "#/components/schemas/WebhookEndpoint" }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        post: {
          security: sessionSecurity,
          summary: "Создать inbound webhook endpoint и вернуть секрет один раз",
          responses: {
            "201": {
              description: "Endpoint создан, secret возвращается один раз",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["webhookEndpoint"],
                    properties: {
                      webhookEndpoint: { $ref: "#/components/schemas/WebhookEndpointWithSecret" }
                    }
                  }
                }
              }
            },
            "400": { description: "Некорректный payload" },
            "404": { description: "Интеграция не найдена" }
          }
        }
      },
      "/webhooks/{endpointId}": {
        post: {
          security: noSecurity,
          summary: "Принять подписанный inbound webhook payload",
          parameters: [
            { name: "endpointId", in: "path", required: true },
            { name: "Idempotency-Key", in: "header", required: true },
            { name: "X-QC-Webhook-Timestamp", in: "header", required: true },
            { name: "X-QC-Webhook-Signature", in: "header", required: true }
          ],
          responses: {
            "202": { description: "Webhook принят и обработан" },
            "200": { description: "Дубликат уже принятого webhook" },
            "401": { description: "Некорректная подпись" },
            "413": { description: "Webhook payload слишком большой" },
            "409": { description: "Конфликт idempotency key" }
          }
        }
      },
      "/jobs": {
        get: {
          security: sessionSecurity,
          summary: "Фоновые задачи workspace",
          responses: {
            "200": { description: "Список задач" }
          }
        },
        post: {
          security: sessionSecurity,
          summary: "Создать фоновую задачу",
          responses: {
            "201": { description: "Задача создана" },
            "400": { description: "Некорректный payload" }
          }
        }
      },
      "/jobs/{jobId}": {
        get: {
          security: sessionSecurity,
          summary: "Детали фоновой задачи и журнал событий",
          responses: {
            "200": { description: "Карточка задачи" }
          }
        }
      },
      "/jobs/run": {
        post: {
          security: sessionSecurity,
          summary: "Запустить доступные фоновые задачи вручную",
          responses: {
            "200": { description: "Задачи обработаны" },
            "400": { description: "Некорректные параметры запуска" }
          }
        }
      },
      "/jobs/{jobId}/cancel": {
        post: {
          security: sessionSecurity,
          summary: "Отменить задачу в очереди",
          responses: {
            "200": { description: "Задача отменена" },
            "409": { description: "Задачу нельзя отменить" }
          }
        }
      },
      "/jobs/{jobId}/requeue": {
        post: {
          security: sessionSecurity,
          summary: "Вернуть ошибочную задачу в очередь",
          responses: {
            "200": { description: "Задача возвращена в очередь" },
            "409": { description: "Задачу нельзя вернуть в очередь" }
          }
        }
      },
      "/conversations": {
        get: {
          security: bearerSecurity,
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
          security: bearerSecurity,
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
          security: bearerSecurity,
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
          security: bearerSecurity,
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
          security: sessionSecurity,
          summary: "История событий обращения в контуре проверки",
          responses: {
            "200": { description: "Список событий обращения" }
          }
        }
      },
      "/reviews/{reviewId}": {
        get: {
          security: bearerSecurity,
          summary: "Детали проверки, критерии, находки, обратная связь и события",
          responses: {
            "200": { description: "Карточка проверки" },
            "404": { description: "Проверка не найдена" }
          }
        }
      },
      "/reviews/{reviewId}/events": {
        get: {
          security: sessionSecurity,
          summary: "История событий проверки",
          responses: {
            "200": { description: "Список событий проверки" }
          }
        }
      },
      "/privacy/conversations/{conversationId}/redact": {
        post: {
          security: sessionSecurity,
          summary: "Маскирование персональных данных в обращении",
          responses: {
            "200": { description: "Обращение замаскировано" },
            "404": { description: "Обращение не найдено" }
          }
        }
      },
      "/reports/snapshots": {
        get: {
          security: sessionSecurity,
          summary: "Готовые снимки отчетности",
          responses: {
            "200": { description: "Список снимков" }
          }
        }
      },
      "/reports/exports": {
        post: {
          security: sessionSecurity,
          summary: "Поставить экспорт отчета в очередь",
          responses: {
            "202": { description: "Задача экспорта создана" },
            "400": { description: "Некорректный период или формат" }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerApiToken: {
          type: "http",
          scheme: "bearer",
          description: "API-токен workspace. Для UI используется серверная сессия."
        },
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "qc_session",
          description: "Сессионная cookie администратора UI."
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
        },
        ScoreSummary: {
          type: "object",
          required: ["totalScore", "scoreUnit", "scoreLabel"],
          properties: {
            totalScore: {
              type: "number",
              minimum: 0,
              maximum: 100,
              description: "Normalized final score 0..100."
            },
            scoreUnit: {
              type: "string",
              enum: ["points"],
              description: "Final score is displayed as points, not percent."
            },
            scoreLabel: {
              type: "string",
              examples: ["92 балла"]
            }
          }
        },
        CertificationSummary: {
          type: "object",
          required: ["status", "label", "productionReady"],
          properties: {
            status: { type: "string" },
            label: { type: "string" },
            productionReady: { type: "boolean" }
          }
        },
        Certification: {
          type: "object",
          required: ["gates", "summary", "docs", "limitations"],
          properties: {
            gates: { type: "object" },
            summary: { $ref: "#/components/schemas/CertificationSummary" },
            docs: {
              type: "array",
              items: {
                type: "object",
                required: ["label", "href", "status"],
                properties: {
                  label: { type: "string" },
                  href: { type: "string" },
                  status: { type: "string" }
                }
              }
            },
            limitations: {
              type: "array",
              items: { type: "string" }
            }
          }
        },
        IntegrationCapability: {
          type: "object",
          required: [
            "source",
            "displayName",
            "type",
            "authModes",
            "operations",
            "supportedEvents",
            "setupStatus",
            "readiness",
            "certification"
          ],
          properties: {
            source: { type: "string" },
            displayName: { type: "string" },
            type: { type: "string" },
            authModes: { type: "array", items: { type: "string" } },
            operations: { type: "array", items: { type: "string" } },
            supportedEvents: { type: "array", items: { type: "string" } },
            requiredSecrets: { type: "array", items: { type: "string" } },
            docsHref: { type: "string" },
            setupStatus: { type: "string", enum: ["available", "preview", "planned"] },
            readiness: { type: "string" },
            certification: { $ref: "#/components/schemas/Certification" }
          }
        },
        WebhookEndpoint: {
          type: "object",
          required: [
            "id",
            "integrationId",
            "source",
            "name",
            "status",
            "acceptedEvents",
            "secretPrefix",
            "signingAlgorithm",
            "lastReceivedAt",
            "lastError",
            "createdAt",
            "updatedAt"
          ],
          properties: {
            id: { type: "string" },
            integrationId: { type: ["string", "null"] },
            source: { type: "string" },
            name: { type: "string" },
            status: { type: "string" },
            acceptedEvents: { type: "array", items: { type: "string" } },
            secretPrefix: { type: "string" },
            signingAlgorithm: { type: "string" },
            lastReceivedAt: { type: ["string", "null"], format: "date-time" },
            lastError: { type: ["string", "null"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" }
          }
        },
        WebhookEndpointWithSecret: {
          allOf: [
            { $ref: "#/components/schemas/WebhookEndpoint" },
            {
              type: "object",
              required: ["secret"],
              properties: {
                secret: { type: "string" }
              }
            }
          ]
        }
      }
    }
  };
}
