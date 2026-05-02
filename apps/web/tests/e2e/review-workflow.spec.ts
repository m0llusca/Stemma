import { execFileSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

test.beforeAll(() => {
  closeSync(openSync("prisma/dev.db", "a"));
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: "file:./dev.db" },
    stdio: "inherit"
  });
});

test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

test("completes the seeded refund request review workflow", async ({ page }) => {
  await page.goto("/reviews");

  await expect(page.getByRole("heading", { name: "Очередь проверок" })).toBeVisible();
  await expect(page.getByText("Найдено")).toBeVisible();
  await expect(page.getByRole("cell", { name: "В очереди" })).toBeVisible();

  await page.getByLabel("Поиск").fill("Мила");
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();

  await page.getByLabel("Поиск").fill("несуществующий клиент");
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByText("Очередь пуста")).toBeVisible();

  await page.goto("/reviews");
  await page.getByLabel("Статус проверки").selectOption("unreviewed");
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();

  await page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" }).click();

  await expect(page.getByRole("heading", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();
  await expect(page.getByText("Шаг 1")).toBeVisible();
  await expect(page.getByText("Оценка по критериям")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Таймлайн диалога" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Управление проверкой" })).toBeVisible();

  await page.getByLabel("Workflow").selectOption("IN_PROGRESS");
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.getByText("В работе").first()).toBeVisible();

  await page.locator('select[name^="criterion."][name$=".evidenceMessageId"]').first().selectOption({ index: 1 });
  await page.getByLabel("Итог проверки").fill("Оператор дал корректные варианты возврата и понятный план follow-up.");

  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText(/Черновик:/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "История проверок" })).toBeVisible();

  await page.getByLabel("Корневая причина").fill("Задержка перевозчика создала неоднозначность по политике возврата.");
  await page
    .getByLabel("Краткое доказательство")
    .fill("Оператор объяснил бонусный кредит и сроки возврата до закрытия диалога.");
  await page.getByLabel("Действие по коучингу").fill("Закрепить проактивное ожидание по срокам доставки.");
  await page.getByLabel("Категория").fill("Политика возврата");

  await page.getByRole("button", { name: "Завершить проверку" }).click();

  await expect(page.getByText("Последняя оценка")).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();
  await expect(page.getByText(/Завершена:/)).toBeVisible();
  await expect(page.getByText("Доказательство", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "История проверок" })).toBeVisible();

  await page.goto("/reviews?status=reviewed");
  await expect(page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Завершена" })).toBeVisible();

  await page.goto("/admin/scorecards");
  await expect(page.getByRole("heading", { name: "Скоркарты", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Новая версия скоркарты" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать новую версию" })).toBeVisible();
  await expect(page.getByText("Сумма весов: 100%")).toBeVisible();
  await page.getByRole("button", { name: "Добавить критерий" }).click();
  await expect(page.getByText("Сумма весов: 101%")).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать новую версию" })).toBeDisabled();

  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Аудит" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "review.finalized" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "API-активность" })).toBeVisible();

  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Отчеты" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "По источникам" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "По операторам" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "По уровню риска" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "По категориям находок" })).toBeVisible();

  await page.goto("/admin/tokens");
  await expect(page.getByRole("heading", { name: "API-токены" })).toBeVisible();
  await expect(page.getByText("Authorization header")).toBeVisible();
  await expect(page.getByRole("button", { name: "Скопировать header" })).toBeVisible();

  await page.goto("/admin/integrations");
  await expect(page.getByRole("heading", { name: "Мастер подключения источника" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Шаг 1. Источник" })).toBeVisible();
  await expect(page.getByLabel("Тип источника")).toHaveValue("otrs_family");
  await expect(page.getByRole("heading", { name: "Тестовый импорт TicketGet" })).not.toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 2. Доступ" })).toBeVisible();
  await expect(page.getByLabel("Платформа")).toHaveValue("znuny");
  await expect(page.getByLabel("TicketID для preview")).toHaveValue("42");

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 3. Лимиты" })).toBeVisible();
  await expect(page.getByLabel("Максимум тикетов")).toHaveValue("100");
  await expect(page.getByLabel("Размер батча")).toHaveValue("25");

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 4. Preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить настройку" })).toBeDisabled();
  await page.getByRole("button", { name: "Проверить подключение и preview" }).click();
  await expect(page.getByText("Preview готов")).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить настройку" })).toBeEnabled();

  await page.getByText("Технические детали OTRS-family").click();
  await expect(page.getByText("Fallback JSON body")).toBeVisible();

  await page.goto("/admin/integrations");
  await page.getByLabel("Тип источника").selectOption("custom_api");
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 2. Доступ" })).toBeVisible();
  await expect(page.getByLabel("Название системы")).toHaveValue("Внутренний helpdesk");
  await expect(page.getByRole("main").getByRole("link", { name: "Токены" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Покрытие адаптеров" })).not.toBeVisible();

  await page.goto("/admin/integrations");
  await page.getByLabel("Тип источника").selectOption("native_helpdesk");
  await page.getByLabel("Сервис").selectOption("zendesk");
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 2. Доступ" })).toBeVisible();
  await expect(page.getByText("Zendesk", { exact: true }).first()).toBeVisible();
  await page.getByText("Mapping и endpoint native-адаптера").click();
  await expect(page.getByText("/api/integrations/native-helpdesks/conversations")).toBeVisible();
  await expect(page.getByRole("button", { name: "Импортировать в очередь" })).not.toBeVisible();
});
