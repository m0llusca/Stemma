import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

const browserDiagnosticsByPage = new WeakMap<Page, string[]>();

test.beforeAll(() => {
  execFileSync("npm", ["run", "db:deploy"], { cwd: process.cwd(), stdio: "inherit" });
});

test.beforeEach(async ({ page }) => {
  execFileSync("npm", ["run", "db:seed"], { cwd: process.cwd(), stdio: "inherit" });
  const diagnostics: string[] = [];
  browserDiagnosticsByPage.set(page, diagnostics);
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") {
      return;
    }

    const text = message.text();
    // Integration catalog may hotlink vendor favicons; bad upstream TLS must not fail the UX smoke.
    if (
      text.includes("net::ERR_CERT_AUTHORITY_INVALID") ||
      text.includes("net::ERR_CONNECTION_REFUSED") ||
      text.includes("Failed to load resource")
    ) {
      return;
    }

    const location = message.location();
    diagnostics.push(
      [
        `route: ${page.url()}`,
        `${message.type()}: ${text}`,
        `source: ${location.url}:${location.lineNumber}:${location.columnNumber}`
      ].join("\n")
    );
  });
  page.on("pageerror", (error) => {
    diagnostics.push(
      [
        `route: ${page.url()}`,
        `pageerror: ${error.message}`,
        `stack: ${error.stack ?? "unavailable"}`
      ].join("\n")
    );
  });
  await page.addInitScript(() => {
    const pattern = /uncontrolled|controlled|FieldControl/i;

    for (const level of ["warn", "error"] as const) {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        const message = args.map(String).join(" ");

        if (pattern.test(message)) {
          original(...args, `\n${new Error("Base UI warning capture").stack ?? ""}`);
          return;
        }

        original(...args);
      };
    }
  });
});

test.afterEach(({ page }) => {
  expect(
    browserDiagnosticsByPage.get(page) ?? [],
    "Browser warning/error/pageerror route and context"
  ).toEqual([]);
});

test("shows standard login with SSO and demo login as separate options", async ({ page }) => {
  await page.goto("/auth/login?returnTo=/reviews");

  await expect(page.getByRole("heading", { name: "Вход в систему" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Вход по учетной записи" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SSO" })).toBeVisible();
  await expect(page.getByText("Microsoft Entra ID / Active Directory")).toBeVisible();
  await expect(page.getByRole("button", { name: "SSO недоступен" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Демо-вход" })).toBeVisible();

  await page.getByRole("button", { name: "Демо-вход" }).press("Enter");
  await page.getByRole("button", { name: "Войти в демо-режиме" }).press("Enter");
  // ADMIN demo user lands on role home (dashboard), not the generic /reviews returnTo.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible();
});

test("completes the seeded refund request review workflow", async ({ page }) => {
  await page.goto("/reviews");

  await expect(page.getByRole("heading", { name: "Очередь проверок" })).toBeVisible();
  await expect(page.getByText(/^Найдено \d+ из \d+/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Где смотреть в очереди сейчас" })).toBeVisible();
  await expect(page.getByLabel("Предпросмотр следующего обращения")).toBeVisible();

  await page.getByLabel("Поиск в очереди проверок").fill("Мила");
  await page.waitForURL((url) => url.searchParams.get("q") === "Мила");
  await expect(page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();

  await page.getByLabel("Поиск в очереди проверок").fill("несуществующий клиент");
  await page.waitForURL((url) => url.searchParams.get("q") === "несуществующий клиент");
  await expect(page.getByText("Очередь пуста", { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.goto("/reviews?status=unreviewed");
  await expect(page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();

  await page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" }).click();

  await expect(page.getByRole("heading", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();
  await expect(page.locator("#review-workspace")).toBeVisible();
  const reviewContext = page.getByLabel("Контекст обращения");
  await expect(reviewContext).toBeVisible();
  await expect(page.getByText("Оценка по критериям")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Таймлайн диалога" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Управление проверкой" })).toBeVisible();

  await page.getByRole("button", { name: /Управление проверкой/ }).click();
  await page.getByLabel("Статус проверки").selectOption("IN_PROGRESS");
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(reviewContext.getByText("В работе", { exact: true })).toBeVisible({
    timeout: 10_000
  });

  const firstEvidenceSelect = page.locator('select[name^="criterion."][name$=".evidenceMessageId"]').first();
  await page.getByRole("button", { name: "В доказательство" }).first().click();
  await expect(firstEvidenceSelect).toHaveValue(/.+/, { timeout: 10_000 });
  await page.getByLabel("Итог проверки").fill("Оператор дал корректные варианты возврата и понятный план follow-up.");

  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Еще не сохранен")).not.toBeVisible();
  await expect(reviewContext.getByText("В работе", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "История проверок" })).toBeVisible();

  await page.getByLabel("Категория").fill("Политика возврата");

  await page.getByRole("button", { name: "Завершить проверку" }).click();

  await expect(reviewContext.getByText("Завершена", { exact: true })).toBeVisible();
  await expect(page.getByText("100 баллов").first()).toBeVisible();
  await expect(page.locator("#review-workspace").getByText("Доказательство", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "История проверок" })).toBeVisible();

  await page.goto("/reviews?status=reviewed&q=Мила");
  await expect(page.getByRole("link", { name: "Запрос на возврат из-за задержки доставки" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Запрос на возврат из-за задержки доставки" }).getByText("Завершена")).toBeVisible();

  await page.goto("/admin/scorecards");
  await expect(page.getByRole("heading", { name: "Формы оценки", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Чем вес отличается от итоговых баллов?" })).toBeVisible();
  await page.getByRole("button", { name: "Новая версия" }).click();
  const scorecardDialog = page.getByRole("dialog", { name: "Новая версия формы оценки" });
  await expect(scorecardDialog).toBeVisible();
  await expect(scorecardDialog.getByRole("heading", { name: "Новая версия формы оценки" })).toBeVisible();
  const createScorecardButton = scorecardDialog.getByRole("button", { name: "Создать новую версию" });
  await expect(createScorecardButton).toBeVisible();
  await expect(scorecardDialog.getByText("Сумма весов 100%", { exact: true })).toBeVisible();
  await scorecardDialog.getByRole("button", { name: "Добавить критерий" }).click();
  await expect(scorecardDialog.getByText("Сумма весов 101%", { exact: true })).toBeVisible();
  await createScorecardButton.click();
  await expect(scorecardDialog.getByRole("alert")).toHaveText(
    "Сумма весов критериев должна быть 100% (сейчас 101%)."
  );

  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Журнал действий" })).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Проверка завершена" })
      .first()
      .getByText("Проверка завершена", { exact: true })
  ).toBeVisible();
  await page.getByRole("tab", { name: /^API-ключи\s+\d+$/ }).click();
  await expect(page.getByRole("heading", { name: "Активность API-ключей" })).toBeVisible();

  await page.goto("/admin/access");
  await expect(page.getByRole("button", { name: "Как работает приоритет групп?" })).toBeVisible();

  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Аналитика качества" })).toBeVisible();
  await expect(page.getByLabel("Где смотреть сейчас")).toBeVisible();
  await expect(page.getByRole("button", { name: "Как считать оценку в баллах?" })).toBeVisible();
  await expect(page.getByText("Оператор для разбора", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Исполнение/ }).click();
  await expect(page.getByText("Источник с просадкой", { exact: true })).toBeVisible();
  await expect(page.getByText("По источникам", { exact: true })).toBeVisible();
  await expect(page.getByText("По операторам", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^Процесс\s+\d+$/ }).click();
  await expect(page.getByText("Категории", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Разрезы/ }).click();
  await expect(page.locator("#details-sources").getByText("Источники", { exact: true })).toBeVisible();
  await expect(page.locator("#details-people").getByText("Операторы", { exact: true })).toBeVisible();
  await expect(page.getByText("Риски", { exact: true }).last()).toBeVisible();

  await page.goto("/calibration");
  await expect(page.getByRole("heading", { name: "Калибровка", exact: true })).toBeVisible();
  const calibrationSessions = page.getByLabel("Сессии калибровки", { exact: true });
  await expect(calibrationSessions).toBeVisible();
  await expect(calibrationSessions.getByText("Сессии", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Рабочая область калибровки").getByText("Калибровка по маршрутизации", {
      exact: true
    })
  ).toBeVisible();

  await page.goto("/coaching");
  await expect(page.getByRole("heading", { name: "Обучение" })).toBeVisible();
  await expect(page.getByLabel("Правила для разбора")).toBeVisible();

  await page.goto("/self-review");
  await expect(page.getByRole("heading", { name: "Моя обратная связь" })).toBeVisible();
  const feedbackWorkspace = page.getByRole("region", { name: "Операторская обратная связь" });
  await expect(feedbackWorkspace.getByText("Требуют ответа", { exact: true })).toBeVisible();
  await expect(feedbackWorkspace.getByText("История", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Учебные задачи")).toBeVisible();

  await page.goto("/admin/tokens");
  await expect(page.getByRole("heading", { level: 1, name: "API-доступ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Что такое scope API-ключа?" })).toBeVisible();
  await page.getByRole("tab", { name: "Локальная проверка" }).click();
  await expect(page.getByText("Заголовок Authorization")).toBeVisible();
  await expect(page.getByRole("button", { name: "Скопировать заголовок" })).toBeVisible();
  await page.getByRole("button", { name: "Новый ключ" }).click();
  const apiKeyDialog = page.getByRole("dialog", { name: "Новый ключ" });
  await expect(apiKeyDialog).toBeVisible();
  await apiKeyDialog.getByLabel("Название").fill("E2E integration key");
  await expect(apiKeyDialog.getByRole("button", { name: "Создать ключ" })).toBeVisible();

  await page.goto("/admin/integrations");
  await expect(page.getByRole("heading", { name: "Интеграции" })).toBeVisible();
  await expect(page.getByLabel("Путь от доступа до мониторинга")).toBeVisible();
  await expect(page.getByLabel("Подключенные источники")).toBeVisible();
  await page.getByRole("tab", { name: "Каталог" }).click();
  await expect(page.getByLabel("Каталог источников")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Jira Service Management" })).toBeVisible();

  await page.getByRole("button", { name: "Новый источник" }).click();
  await expect(page.getByRole("heading", { name: "Новый источник" })).toBeVisible();
  await expect(page.getByText("Мастер подключения источника", { exact: true })).toBeVisible();
  await expect(page.getByText("Подключение источника", { exact: true })).toBeVisible();
  const setupPanel = page
    .getByText("Подключение источника", { exact: true })
    .locator("xpath=ancestor::*[@data-slot='card'][1]");
  const selectedSourceSummary = setupPanel.locator('[aria-live="polite"]');
  await setupPanel.getByRole("radio", { name: /Znuny/ }).click();
  await expect(setupPanel.getByRole("radio", { name: /Znuny/ })).toBeChecked();
  await expect(selectedSourceSummary).toContainText("Znuny");
  await setupPanel.getByRole("radio", { name: /Zendesk/ }).click();
  await expect(setupPanel.getByRole("radio", { name: /Zendesk/ })).toBeChecked();
  await expect(selectedSourceSummary).toContainText("Zendesk");

  await page.goto("/admin/integrations");
  const znunyIntegrationCard = page.getByRole("row").filter({ hasText: "Znuny / OTRS / OTOBO" }).first();
  await expect(znunyIntegrationCard).toContainText("Семейство OTRS");
  await expect(znunyIntegrationCard).toContainText("В плане");
  await expect(znunyIntegrationCard.getByText("Не готово", { exact: true })).toBeVisible();
  await expect(znunyIntegrationCard.getByText("Проверка готова", { exact: true })).toBeVisible();
  await znunyIntegrationCard.getByRole("button", { name: "Открыть", exact: true }).click();
  const integrationSummary = page.getByRole("region", { name: "Сводка источника" });
  await expect(integrationSummary).toBeVisible();
  await expect(integrationSummary).toContainText("18/100");
});
