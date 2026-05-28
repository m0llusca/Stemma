import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

test("shows standard login with SSO and demo login as separate options", async ({ page }) => {
  await page.goto("/auth/login?returnTo=/reviews");

  await expect(page.getByRole("heading", { name: "Вход в систему" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Вход по учетной записи" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SSO" })).toBeVisible();
  await expect(page.getByText("Microsoft Entra ID / Active Directory")).toBeVisible();
  await expect(page.getByRole("button", { name: "SSO недоступен" })).toBeDisabled();
  await expect(page.locator("summary").filter({ hasText: "Демо-вход" })).toBeVisible();

  await page.locator("summary").filter({ hasText: "Демо-вход" }).press("Enter");
  await page.getByRole("button", { name: "Войти в демо-режиме" }).press("Enter");
  await expect(page).toHaveURL(/\/reviews$/);
  await expect(page.getByRole("heading", { name: "Очередь проверок" })).toBeVisible();
});

test("completes the seeded refund request review workflow", async ({ page }) => {
  await page.goto("/reviews");

  await expect(page.getByRole("heading", { name: "Очередь проверок" })).toBeVisible();
  await expect(page.getByText("Найдено")).toBeVisible();
  await expect(page.getByText(/завершено/i).first()).toBeVisible();

  await page.getByLabel("Поиск в очереди проверок").fill("Мила");
  await page.waitForURL((url) => url.searchParams.get("q") === "Мила");
  await expect(page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();

  await page.getByLabel("Поиск в очереди проверок").fill("несуществующий клиент");
  await page.waitForURL((url) => url.searchParams.get("q") === "несуществующий клиент");
  await expect(page.getByRole("heading", { name: "Очередь пуста" })).toBeVisible({ timeout: 10_000 });

  await page.goto("/reviews?status=unreviewed");
  await expect(page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();

  await page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" }).click();

  await expect(page.getByRole("heading", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Контекст обращения" })).toBeVisible();
  await expect(page.getByText("Оценка по критериям")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Таймлайн диалога" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Управление проверкой" })).toBeVisible();

  await page.locator("summary").filter({ hasText: "Управление проверкой" }).click();
  await page.getByLabel("Состояние проверки").selectOption("IN_PROGRESS");
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(".meta-chip").filter({ hasText: "Состояние" }).filter({ hasText: "В работе" })).toBeVisible({
    timeout: 10_000
  });

  const firstEvidenceSelect = page.locator('select[name^="criterion."][name$=".evidenceMessageId"]').first();
  await page.getByRole("button", { name: "В доказательство" }).first().click();
  await expect(firstEvidenceSelect).toHaveValue(/.+/, { timeout: 10_000 });
  await page.getByLabel("Итог проверки").fill("Оператор дал корректные варианты возврата и понятный план follow-up.");

  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Еще не сохранен")).not.toBeVisible();
  await expect(page.locator(".meta-chip").filter({ hasText: "Состояние" }).filter({ hasText: "В работе" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "История проверок" })).toBeVisible();

  await page.getByLabel("Категория").fill("Политика возврата");

  await page.getByRole("button", { name: "Завершить проверку" }).click();

  await expect(page.locator("span").filter({ hasText: /^СостояниеЗавершена$/ })).toBeVisible();
  await expect(page.getByText("100 баллов").first()).toBeVisible();
  await expect(page.getByText("Доказательство", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "История проверок" })).toBeVisible();

  await page.goto("/reviews?status=reviewed");
  await expect(page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "Запрос на возврат из-за задержки доставки" }).getByText("Завершена")).toBeVisible();

  await page.goto("/admin/scorecards");
  await expect(page.getByRole("heading", { name: "Формы оценки", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Чем вес отличается от итоговых баллов?" })).toBeVisible();
  await page.getByRole("link", { name: "Новая версия" }).first().click();
  await expect(page.getByRole("heading", { name: "Выпуск формы оценки" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать новую версию" })).toBeVisible();
  await expect(page.getByText("Сумма весов: 100%")).toBeVisible();
  await page.getByRole("button", { name: "Добавить критерий" }).click();
  await expect(page.getByText("Сумма весов: 101%")).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать новую версию" })).toBeDisabled();

  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Журнал действий" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Проверка завершена" })).toBeVisible();
  await page.getByRole("link", { name: "API-ключи" }).first().click();
  await expect(page.getByRole("heading", { name: "Активность API-ключей" })).toBeVisible();

  await page.goto("/admin/access");
  await expect(page.getByRole("button", { name: "Как работает приоритет групп?" })).toBeVisible();

  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Аналитика качества" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Как считать оценку в баллах?" })).toBeVisible();
  await expect(page.getByText("Источник с худшей оценкой")).toBeVisible();
  await page.getByRole("link", { name: /Исполнение/ }).click();
  await expect(page.getByRole("heading", { name: "По источникам" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "По операторам" })).toBeVisible();
  await page.getByRole("link", { name: /^Процесс\s+\d+$/ }).click();
  await expect(page.getByRole("heading", { name: "Категории" })).toBeVisible();
  await page.getByRole("link", { name: /Разрезы/ }).click();
  await expect(page.getByRole("heading", { name: "Источники" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Операторы" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Риски" })).toBeVisible();

  await page.goto("/calibration");
  await expect(page.getByRole("heading", { name: "Калибровка", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Сессии" })).toBeVisible();
  await expect(page.locator("h2").filter({ hasText: "Калибровка по маршрутизации" })).toBeVisible();

  await page.goto("/coaching");
  await expect(page.getByRole("heading", { name: "Обучение" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Очередь обучения" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Правила для разбора" })).toBeVisible();

  await page.goto("/self-review");
  await expect(page.getByRole("heading", { name: "Моя обратная связь" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Требуют ответа" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "История" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Учебные задачи" })).toBeVisible();

  await page.goto("/admin/tokens");
  await expect(page.getByRole("heading", { level: 1, name: "Ключи API" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Что такое scope API-ключа?" })).toBeVisible();
  await page.getByRole("link", { name: "Локальная проверка" }).click();
  await expect(page.getByText("Заголовок Authorization")).toBeVisible();
  await expect(page.getByRole("button", { name: "Скопировать заголовок" })).toBeVisible();
  await page.getByRole("link", { name: "Новый ключ" }).first().click();
  await expect(page.getByRole("heading", { name: "Новый рабочий ключ" })).toBeVisible();
  await page.getByLabel("Название").fill("E2E integration key");
  await expect(page.getByRole("button", { name: "Создать ключ" })).toBeVisible();

  await page.goto("/admin/integrations");
  await expect(page.getByRole("heading", { name: "Интеграции" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Подключенные источники" })).toBeVisible();
  await page.getByRole("link", { name: "План источников" }).click();
  await expect(page.getByRole("heading", { name: "План источников" })).toBeVisible();
  await expect(page.getByText("Общие вебхуки")).toBeVisible();

  await page.getByRole("link", { name: "Новый источник" }).click();
  await expect(page.getByRole("heading", { name: "Новый источник" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Мастер подключения источника" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Шаг 1. Источник" })).toBeVisible();
  const setupPanel = page.getByRole("heading", { name: "Мастер подключения источника" }).locator("xpath=ancestor::section[1]");
  await expect(setupPanel.getByLabel("Система-источник")).toHaveValue("otrs:znuny");
  await setupPanel.getByLabel("Система-источник").selectOption("custom_api");
  await expect(page.getByRole("heading", { name: "Своя система через API" })).toBeVisible();
  await setupPanel.getByLabel("Система-источник").selectOption("native:zendesk");
  await expect(page.getByRole("heading", { name: "Zendesk" })).toBeVisible();

  await page.goto("/admin/integrations");
  const znunyIntegrationCard = page.getByRole("row").filter({ hasText: "Znuny / OTRS / OTOBO" }).first();
  await expect(znunyIntegrationCard).toContainText("OTRS/Znuny · В плане · курсор есть · вебхуки нет");
  await expect(znunyIntegrationCard).toContainText("Не готово к промышленной эксплуатации");
  await expect(znunyIntegrationCard).toContainText("Проверка готова");
  await znunyIntegrationCard.getByRole("link", { name: "Открыть панель" }).click();
  await expect(page.getByRole("heading", { name: "Сводка источника" })).toBeVisible();
  await expect(page.getByText("Импортировано 18/100")).toBeVisible();
});
