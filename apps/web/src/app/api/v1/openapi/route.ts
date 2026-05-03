import { apiJson } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiJson({
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
        post: {
          summary: "Импорт обращения из кастомной системы",
          parameters: [{ name: "Idempotency-Key", in: "header", required: false }],
          responses: {
            "201": { description: "Обращение импортировано" },
            "409": { description: "Конфликт idempotency key" }
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
          scheme: "bearer",
          description: "API-токен workspace. Для UI используется серверная сессия."
        }
      }
    }
  });
}
