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
      "/conversations": {
        post: {
          summary: "Импорт обращения из кастомной системы",
          parameters: [{ name: "Idempotency-Key", in: "header", required: false }],
          responses: {
            "201": { description: "Обращение импортировано" },
            "409": { description: "Конфликт idempotency key" }
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

