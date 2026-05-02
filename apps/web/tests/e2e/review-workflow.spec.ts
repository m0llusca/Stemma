import { execFileSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { expect, test } from "@playwright/test";

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

  await page.getByLabel("Итог проверки").fill("Оператор дал корректные варианты возврата и понятный план follow-up.");
  await page.getByLabel("Корневая причина").fill("Задержка перевозчика создала неоднозначность по политике возврата.");
  await page
    .getByLabel("Краткое доказательство")
    .fill("Оператор объяснил бонусный кредит и сроки возврата до закрытия диалога.");
  await page.getByLabel("Действие по коучингу").fill("Закрепить проактивное ожидание по срокам доставки.");
  await page.getByLabel("Категория").fill("Политика возврата");

  await page.getByRole("button", { name: "Завершить проверку" }).click();

  await expect(page.getByText("Последняя оценка")).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();
  await expect(page.getByText(/Завершена:/)).toBeVisible();

  await page.goto("/reviews?status=reviewed");
  await expect(page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Завершена" })).toBeVisible();

  await page.goto("/admin/scorecards");
  await expect(page.getByRole("heading", { name: "Скоркарты", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Новая версия скоркарты" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать новую версию" })).toBeVisible();

  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Аудит" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "review.finalized" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "API-активность" })).toBeVisible();

  await page.goto("/admin/integrations");
  await expect(page.getByRole("heading", { name: "OTRS-family adapter readiness" })).toBeVisible();
  await expect(page.getByText("Этап 2 · первый native track")).toBeVisible();
});
