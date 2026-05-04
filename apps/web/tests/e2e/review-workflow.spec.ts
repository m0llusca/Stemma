import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(() => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
});

test("shows standard login with SSO as a separate option", async ({ page }) => {
  await page.goto("/auth/login?returnTo=/reviews");

  await expect(page.getByRole("heading", { name: "Вход в систему" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Вход по учетной записи" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SSO" })).toBeVisible();
  await expect(page.getByText("Microsoft Entra ID / Active Directory")).toBeVisible();
  await expect(page.getByRole("button", { name: "SSO недоступен" })).toBeDisabled();

  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/reviews$/);
  await expect(page.getByRole("heading", { name: "Очередь проверок" })).toBeVisible();
});

test("completes the seeded refund request review workflow", async ({ page }) => {
  await page.goto("/reviews");

  await expect(page.getByRole("heading", { name: "Очередь проверок" })).toBeVisible();
  await expect(page.getByText("Найдено")).toBeVisible();
  await expect(page.getByText("Завершено").first()).toBeVisible();

  await page.getByLabel("Поиск").fill("Мила");
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();

  await page.getByLabel("Поиск").fill("несуществующий клиент");
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByRole("heading", { name: "Очередь пуста" })).toBeVisible({ timeout: 10_000 });

  await page.goto("/reviews");
  await page.getByLabel("Статус проверки").selectOption("unreviewed");
  await page.getByRole("button", { name: "Применить" }).click();
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
  await expect(page.getByText("100%").first()).toBeVisible();
  await expect(page.getByText("Доказательство", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "История проверок" })).toBeVisible();

  await page.goto("/reviews?status=reviewed");
  await expect(page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "Запрос на возврат из-за задержки доставки" }).getByText("Завершена")).toBeVisible();

  await page.goto("/admin/scorecards");
  await expect(page.getByRole("heading", { name: "Формы оценки", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Новая версия формы оценки" })).toBeVisible();
  await page.getByRole("heading", { name: "Новая версия формы оценки" }).click();
  await expect(page.getByRole("button", { name: "Создать новую версию" })).toBeVisible();
  await expect(page.getByText("Сумма весов: 100%")).toBeVisible();
  await page.getByRole("button", { name: "Добавить критерий" }).click();
  await expect(page.getByText("Сумма весов: 101%")).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать новую версию" })).toBeDisabled();

  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Журнал действий" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Проверка завершена" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Активность API-ключей" })).toBeVisible();

  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Аналитика качества" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Что требует внимания" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Дополнительная аналитика" })).toBeVisible();
  await page.getByText("Дополнительная аналитика").click();
  await expect(page.getByRole("heading", { name: "Источники" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Операторы" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Подробные разрезы" })).toBeVisible();
  await page.getByText("Подробные разрезы").click();
  await expect(page.getByRole("heading", { name: "Риски" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Категории" })).toBeVisible();

  await page.goto("/calibration");
  await expect(page.getByRole("heading", { name: "Калибровка", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Сессии" })).toBeVisible();
  await expect(page.locator("h2").filter({ hasText: "Калибровка по маршрутизации" })).toBeVisible();

  await page.goto("/coaching");
  await expect(page.getByRole("heading", { name: "Обучение" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Учебные задачи" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "База ошибок" })).toBeVisible();

  await page.goto("/self-review");
  await expect(page.getByRole("heading", { name: "Моя обратная связь" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Проверки к ознакомлению" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Учебные задачи" })).toBeVisible();

  await page.goto("/admin/tokens");
  await expect(page.getByRole("heading", { name: "Ключи API" })).toBeVisible();
  await expect(page.getByText("Заголовок Authorization")).toBeVisible();
  await expect(page.getByRole("button", { name: "Скопировать заголовок" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Новый рабочий ключ" })).toBeVisible();
  await page.getByLabel("Название").fill("E2E integration key");
  await page.getByRole("button", { name: "Создать ключ" }).click();
  await expect(page.getByText("API-ключ создан")).toBeVisible();
  await expect(page.getByRole("button", { name: "Скопировать новый ключ" })).toBeVisible();
  await expect(page.getByTestId("created-api-token-secret")).toHaveText(/^qc_/);

  const createdTokenCard = page.locator(".admin-tile").filter({ hasText: "E2E integration key" });
  await expect(createdTokenCard.getByText("Готов")).toBeVisible();
  await createdTokenCard.getByRole("button", { name: "Отозвать" }).click();
  await expect(createdTokenCard.getByText("Истек")).toBeVisible();

  await page.goto("/admin/integrations");
  await expect(page.getByRole("heading", { name: "Подключить источник" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Мастер подключения источника" })).not.toBeVisible();
  await page.getByRole("heading", { name: "Подключить источник" }).click();
  await expect(page.getByRole("heading", { name: "Мастер подключения источника" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Шаг 1. Источник" })).toBeVisible();
  await expect(page.getByLabel("Источник")).toHaveValue("otrs:znuny");
  await expect(page.getByRole("heading", { name: "Тестовый импорт TicketGet" })).not.toBeVisible();

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 2. Доступ" })).toBeVisible();
  await expect(page.getByText("Источник", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Znuny", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Base URL")).toHaveValue("https://support.example.com/znuny");
  await expect(page.getByLabel("Платформа")).not.toBeVisible();
  await expect(page.getByLabel("TicketID для проверки")).toHaveValue("42");
  await expect(page.getByRole("button", { name: "Далее" })).toBeDisabled();
  await page.getByLabel("Password").fill("demo-secret");

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 3. Лимиты" })).toBeVisible();
  await expect(page.getByLabel("Максимум тикетов")).toHaveValue("100");
  await expect(page.getByLabel("Размер батча")).toHaveValue("25");

  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 4. Проверка" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить настройку" })).toBeDisabled();
  await page.getByRole("button", { name: "Проверить подключение" }).click();
  await expect(page.getByText("Проверка поставлена в очередь")).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить настройку" })).toBeEnabled();

  await page.getByText("Технические детали OTRS-family").click();
  await expect(page.getByRole("heading", { name: "Запасной JSON-запрос" })).toBeVisible();

  await page.goto("/admin/integrations");
  const znunyIntegrationCard = page.locator(".admin-tile").filter({ hasText: "Znuny" }).first();
  await expect(znunyIntegrationCard.getByRole("button", { name: "Запланировать импорт" })).toBeVisible();
  await znunyIntegrationCard.getByRole("button", { name: "Запланировать импорт" }).click();
  await expect(znunyIntegrationCard.getByText("Импорт поставлен в backend-очередь")).toBeVisible();
  await page.reload();
  await expect(znunyIntegrationCard.getByText("В очереди").first()).toBeVisible();
  await expect(znunyIntegrationCard.getByRole("link", { name: /Backend job/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "Запустить очередь сейчас" }).click();
  await expect(page.getByText(/Запущено задач:/)).toBeVisible({ timeout: 45_000 });
  await page.reload();
  await expect(page.getByText(/Повтор запланирован|Dry-run готов|Импорт готов|Ошибка/).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("link", { name: /Backend job/ }).first()).toBeVisible();

  await page.getByRole("heading", { name: "Подключить источник" }).click();
  await page.getByLabel("Источник").selectOption("custom_api");
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 2. Доступ" })).toBeVisible();
  await expect(page.getByLabel("Название системы")).toHaveValue("Внутренний helpdesk");
  await expect(page.locator("#connect").getByRole("link", { name: "API-доступ" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Покрытие адаптеров" })).not.toBeVisible();

  await page.goto("/admin/integrations");
  await page.getByRole("heading", { name: "Подключить источник" }).click();
  await page.getByLabel("Источник").selectOption("native:zendesk");
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 2. Доступ" })).toBeVisible();
  await expect(page.getByText("Zendesk", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Выбранный сервис")).not.toBeVisible();
  await page.getByText("Сопоставление готового адаптера").click();
  await expect(page.getByText("/api/integrations/native-helpdesks/conversations")).toBeVisible();
  await expect(page.getByRole("button", { name: "Импортировать в очередь" })).not.toBeVisible();
});
