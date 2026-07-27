# Shadcn Analytics and Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore report controls and charts, remove top-navigation overflow, and make integration detail pages readable at all audited widths.

**Architecture:** Keep each deep product component responsible for its own geometry. `ReportPeriodControls` overrides the width imposed by shadcn `FieldGroup`; both chart components render self-contained SVG presentation and accessible interactions; the existing `AppNavShell` switches between compact and full navigation through an inline-size container; integration pages flatten non-interactive nested surfaces locally.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4 container queries, shadcn/ui on Base UI, Lucide, Vitest + Testing Library, Playwright.

## Global Constraints

- Approved specification: `docs/superpowers/specs/2026-07-27-shadcn-layout-remediation-design.md`.
- Complete the review-workspace plan first so `tests/e2e/helpers/layout.ts` exists.
- Keep public chart props, report query parameters, route hrefs, server actions, integration semantics, and permissions unchanged.
- Do not re-enable legacy styles or create a second theme.
- Do not hide overflow on `body`, `html`, `PageShell`, or the app header.
- Use `break-all` only for technical IDs/URLs, never ordinary Russian copy.
- A visual baseline is evidence, not a target for pixel equality with the broken UI.
- Before editing, run `git status --short` and record the state of every path
  listed by the task. The commit
  commands below assume those targets were clean; for a pre-existing dirty file,
  stage only new hunks with `git add -p` and inspect `git diff --cached`. If an
  overlapping hunk cannot be isolated safely, leave it uncommitted and report it.
- Run commands from `apps/web`.

---

## Task 1: Add failing analytics/shell browser regressions

**Files:**

- Create: `apps/web/tests/e2e/analytics-shell-layout.spec.ts`
- Reuse: `apps/web/tests/e2e/helpers/layout.ts`
- Reuse: `apps/web/tests/e2e/helpers/auth.ts`

- [ ] **Step 1: Capture console failures centrally**

```ts
function collectUnexpectedConsole(page: Page) {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      messages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
  return messages;
}
```

- [ ] **Step 2: Add report-control geometry assertions**

At 390, 768, 1280, and 1440 px:

```ts
const form = page.locator('form[action="/reports"]');
const period = page.getByLabel("Период");
const trend = page.getByLabel("График");
const comparison = page.getByText(/^Сравнение:/).locator("..");

for (const locator of [form, period, trend, comparison]) {
  expect((await rect(locator)).width).toBeGreaterThan(80);
}
await expectNoDocumentOverflow(page);
```

- [ ] **Step 3: Add chart visibility and keyboard assertions**

For populated seeded data, assert:

```ts
const chart = page.getByRole("img", { name: /Тренд/ }).first();
await expect(chart).toBeVisible();
expect(await chart.locator("path").first().evaluate((node) => getComputedStyle(node).stroke))
  .not.toBe("none");

const point = page.getByRole("button", { name: /балл/ }).first();
await point.focus();
await expect(page.getByRole("tooltip")).toBeVisible();
```

Also assert a Russian empty state after selecting a deliberately empty custom range.

- [ ] **Step 4: Add navigation and integration geometry cases**

At every width:

- global nav `scrollWidth - clientWidth <= 2`;
- every product area is reachable either as a visible link or in the same `Разделы` menu;
- at 1280 with a constrained nav container, the compact active-area trigger appears;
- at 1440 with at least 42rem available, full area links appear in one line;
- integration detail ordinary labels do not use `word-break: break-all`;
- technical URLs/IDs stay within their owner.

- [ ] **Step 5: Run the new spec and confirm red**

```bash
npx playwright test tests/e2e/analytics-shell-layout.spec.ts --project=chromium
```

Expected: FAIL on zero-width report controls, invisible SVG presentation, nav overflow, integration wrapping, and/or captured Base UI warning.

- [ ] **Step 6: Commit the red browser contract**

```bash
git add tests/e2e/analytics-shell-layout.spec.ts
git commit -m "test: capture analytics and shell layout regressions"
```

---

## Task 2: Fix ReportPeriodControls width ownership

**Files:**

- Modify: `apps/web/src/components/reports/report-command-bar.tsx`
- Create: `apps/web/tests/unit/report-command-bar.test.tsx`
- Modify: `apps/web/tests/e2e/analytics-shell-layout.spec.ts`

- [ ] **Step 1: Add a semantic unit test**

Render `ReportPeriodControls` and assert the form fields, resolved range, and comparison copy remain accessible. Do not assert class strings:

```tsx
const { container } = render(
  <ReportPeriodControls
    period={period}
    previousPeriod={previousPeriod}
    view="overview"
    trendGranularity="day"
  />
);

const controls = container.querySelector('[aria-label="Настройки аналитики"]');
expect(controls).toBeInTheDocument();
expect(within(controls as HTMLElement).getByLabelText("Период")).toHaveValue("vk-current");
expect(within(controls as HTMLElement).getByLabelText("График")).toHaveValue("day");
expect(within(controls as HTMLElement).getByText(/^Сравнение:/)).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused tests**

```bash
npx vitest run tests/unit/report-command-bar.test.tsx
npx playwright test tests/e2e/analytics-shell-layout.spec.ts --project=chromium --grep "report controls"
```

Expected: unit semantics pass or require minor setup; browser geometry remains red.

- [ ] **Step 3: Apply the minimal width fix**

Keep the form `w-full min-w-0 flex-1`. Change the comparison owner to:

```tsx
<FieldGroup className="w-full min-w-0 gap-1 text-left sm:w-auto sm:max-w-72 sm:flex-none sm:items-end sm:text-right">
```

Do not change `FieldGroup` globally: its `w-full` default is correct for ordinary grouped forms.

- [ ] **Step 4: Verify measured widths**

```bash
npx vitest run tests/unit/report-command-bar.test.tsx
npx playwright test tests/e2e/analytics-shell-layout.spec.ts --project=chromium --grep "report controls"
```

Expected: PASS; no form/select width is zero and no document overflow is introduced.

- [ ] **Step 5: Commit the local fix**

```bash
git add src/components/reports/report-command-bar.tsx tests/unit/report-command-bar.test.tsx tests/e2e/analytics-shell-layout.spec.ts
git commit -m "fix: preserve report control widths"
```

---

## Task 3: Make TrendChart self-contained

**Files:**

- Modify: `apps/web/src/components/reports/trend-chart.tsx`
- Modify: `apps/web/tests/unit/report-charts.test.tsx`

- [ ] **Step 1: Replace legacy-class assertions with observable SVG assertions**

```tsx
const { container } = render(
  <TrendChart
    ariaLabel="Тренд качества"
    points={[{ label: "Пн", value: 72 }, { label: "Вт", value: 84 }]}
    volume={[5, 9]}
  />
);

const svg = screen.getByRole("img", { name: "Тренд качества" });
expect(svg).toHaveAttribute("viewBox", "0 0 320 96");
expect(container.querySelector('path[data-slot="trend-line"]')).toHaveAttribute("stroke", "var(--primary)");
expect(container.querySelectorAll('[data-slot="trend-point"]')).toHaveLength(2);
expect(container.querySelector('[data-slot="trend-volume-bar"]')).toHaveAttribute("fill");
```

Add a test that all-null/empty input renders explicit Russian copy rather than an invisible SVG.

- [ ] **Step 2: Run the tests and confirm red**

```bash
npx vitest run tests/unit/report-charts.test.tsx --testNamePattern="TrendChart"
```

Expected: FAIL because visible presentation still depends on retired CSS and empty data returns `null`.

- [ ] **Step 3: Move presentation into SVG attributes and local utilities**

Required implementation properties:

- wrapper is a positioned grid with `min-w-0`;
- SVG has `w-full overflow-visible`;
- line uses `fill="none"`, semantic stroke, `strokeWidth`, rounded joins/caps, and `vectorEffect="non-scaling-stroke"`;
- volume bars use semantic muted fill;
- the last point differs by radius and ring, not color alone;
- axes are positioned by the component;
- `data-slot` describes semantic chart parts;
- empty/insufficient series renders a visible Russian empty state.

- [ ] **Step 4: Run chart tests**

```bash
npx vitest run tests/unit/report-charts.test.tsx --testNamePattern="TrendChart"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/trend-chart.tsx tests/unit/report-charts.test.tsx
git commit -m "fix: make trend chart presentation self contained"
```

---

## Task 4: Make InteractiveSparklineChart visible and keyboard-operable

**Files:**

- Modify: `apps/web/src/components/reports/interactive-sparkline-chart.tsx`
- Modify: `apps/web/tests/unit/report-charts.test.tsx`
- Modify: `apps/web/tests/e2e/analytics-shell-layout.spec.ts`

- [ ] **Step 1: Write behavior-first tests**

Assert SVG attributes and accessible controls instead of `.interactive-sparkline__*` classes:

```tsx
const points = [
  { label: "22 июн", value: 73, detail: "12 проверок" },
  { label: "29 июн", value: 81, detail: "17 проверок" }
];
render(<InteractiveSparklineChart points={points} target={85} />);

expect(screen.getByRole("img", { name: "Тренд средней оценки" })).toBeInTheDocument();
const controls = screen.getAllByRole("button", { name: /проверок/ });
expect(controls).toHaveLength(2);
controls[1].focus();
expect(screen.getByRole("tooltip")).toHaveTextContent("81");
```

- [ ] **Step 2: Confirm red**

```bash
npx vitest run tests/unit/report-charts.test.tsx --testNamePattern="sparkline"
```

Expected: FAIL until the point hit targets expose button semantics/tooltip and the SVG carries its own presentation.

- [ ] **Step 3: Implement accessible point controls**

- keep one measured plot owner and existing math;
- keep `ResizeObserver` only for plot width, with a deterministic fallback;
- give each point an actual focusable control or equivalent keyboard-semantic hit target;
- use `aria-describedby` to connect the active point to `role="tooltip"`;
- expose active state with shape/radius/stroke as well as color;
- put target band, line, points, labels, plot height, and focus ring in the component;
- keep `Link` annotations and public props unchanged.

- [ ] **Step 4: Verify unit and browser behavior**

```bash
npx vitest run tests/unit/report-charts.test.tsx
npx playwright test tests/e2e/analytics-shell-layout.spec.ts --project=chromium --grep "chart"
```

Expected: PASS in light/dark, by mouse and keyboard.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/interactive-sparkline-chart.tsx tests/unit/report-charts.test.tsx tests/e2e/analytics-shell-layout.spec.ts
git commit -m "fix: restore accessible report charts"
```

---

## Task 5: Make AppNavShell container-aware

**Files:**

- Modify: `apps/web/src/components/app-nav-shell.tsx`
- Modify: `apps/web/tests/unit/app-nav-shell.test.tsx`
- Modify: `apps/web/tests/e2e/app-shell-routes.spec.ts`
- Modify: `apps/web/tests/e2e/analytics-shell-layout.spec.ts`

- [ ] **Step 1: Extend the semantic unit contract**

Assert there is one compact `Разделы` menu using the same `areas` array and one full nav using the same active-area semantics. Both must mark the active destination with `aria-current="page"`.

- [ ] **Step 2: Confirm the geometry case is still red**

```bash
npx playwright test tests/e2e/analytics-shell-layout.spec.ts --project=chromium --grep "navigation"
```

Expected: FAIL because the current desktop nav uses `overflow-x-auto`.

- [ ] **Step 3: Implement inline-size container disclosure**

Make the middle navigation region `@container/nav min-w-0 flex-1`.

- below `md`, keep the existing icon menu;
- from `md` until the nav container reaches 42rem, show a compact trigger with active icon + active label;
- at `@2xl/nav` (42rem), show all links in one row;
- remove `overflow-x-auto` from the product-area nav;
- keep search, primary action, work-pulse badges, and identity access visible;
- collapse work-pulse labels before badge values;
- derive menu and full links from the same `areas` collection.

- [ ] **Step 4: Run unit and browser tests**

```bash
npx vitest run tests/unit/app-nav-shell.test.tsx tests/unit/app-nav.test.tsx
npx playwright test tests/e2e/analytics-shell-layout.spec.ts tests/e2e/app-shell-routes.spec.ts --project=chromium --grep "navigation|app shell"
```

Expected: PASS with no permanent horizontal scrollbar and every area reachable.

- [ ] **Step 5: Commit**

```bash
git add src/components/app-nav-shell.tsx tests/unit/app-nav-shell.test.tsx tests/e2e/app-shell-routes.spec.ts tests/e2e/analytics-shell-layout.spec.ts
git commit -m "fix: make product navigation container aware"
```

---

## Task 6: Flatten integration detail density and fix word wrapping

**Files:**

- Modify: `apps/web/src/app/admin/integrations/[integrationId]/page.tsx`
- Modify: `apps/web/src/components/integrations/integration-ui.tsx`
- Create: `apps/web/tests/unit/integration-ui-layout.test.tsx`
- Modify: `apps/web/tests/e2e/analytics-shell-layout.spec.ts`

- [ ] **Step 1: Add a component contract for fact rows**

Extract only the repeated local fact-row primitive when at least three page sections need it:

```tsx
render(
  <IntegrationFact label="Адрес источника" technical>
    https://support.example.test/very/long/path
  </IntegrationFact>
);
expect(screen.getByText("Адрес источника")).toBeInTheDocument();
expect(screen.getByText(/support\.example/)).toHaveAttribute("data-technical", "true");
```

The contract describes semantic intent; it must not assert a Tailwind string.

- [ ] **Step 2: Confirm current integration E2E is red**

```bash
npx playwright test tests/e2e/analytics-shell-layout.spec.ts --project=chromium --grep "integration"
```

Expected: FAIL on cramped nested surfaces, ordinary-word breaking, or overflow.

- [ ] **Step 3: Flatten only non-interactive nested cards**

In `AdapterReadinessPanel`, `NonOtrsIntegrationSummary`, summary, and operations sections:

- retain a `Card` when it owns an independent action, form, collapse state, or table;
- replace purely descriptive child cards with bordered/sectioned blocks inside the parent;
- use `grid-cols-[minmax(0,auto)_minmax(0,1fr)]` or responsive equivalents;
- add `min-w-0` at every shrinkable grid/flex child;
- use `break-words` for prose and labels;
- apply `break-all`/`overflow-wrap:anywhere` only to technical values marked `data-technical`;
- keep status labels such as `Импортировано` intact.

- [ ] **Step 4: Run focused verification**

```bash
npx vitest run tests/unit/integration-ui-layout.test.tsx
npx playwright test tests/e2e/analytics-shell-layout.spec.ts --project=chromium --grep "integration"
```

Expected: PASS at 390/768/1280/1440 without document overflow.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/admin/integrations/[integrationId]/page.tsx' src/components/integrations/integration-ui.tsx tests/unit/integration-ui-layout.test.tsx tests/e2e/analytics-shell-layout.spec.ts
git commit -m "fix: restore integration detail density"
```

---

## Task 7: Reproduce and eliminate the Base UI control warning

**Files:**

- Modify after stack-trace confirmation: `apps/web/src/components/integrations/connect-source-form.tsx`
- Modify after stack-trace confirmation: the specific control component named by the failing stack
- Modify: `apps/web/tests/unit/connect-source-form.test.tsx`
- Modify: `apps/web/tests/e2e/analytics-shell-layout.spec.ts`

- [ ] **Step 1: Pin the warning before changing code**

Spy on `console.error` and `console.warn`, render the multi-source path, switch a source, and fail only on controlled/uncontrolled messages:

```tsx
const errors: string[] = [];
vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args.join(" ")));
vi.spyOn(console, "warn").mockImplementation((...args) => errors.push(args.join(" ")));

render(<ConnectSourceForm sources={[zendesk, otrs]} />);
fireEvent.click(screen.getByRole("radio", { name: /Zendesk/ }));
expect(errors.filter((message) => /uncontrolled|controlled|FieldControl/i.test(message))).toEqual([]);
```

If the unit path does not reproduce it, keep the Playwright console assertion as the failing test and use its component stack. Do not guess.

- [ ] **Step 2: Run and retain the exact failure evidence**

```bash
npx vitest run tests/unit/connect-source-form.test.tsx
npx playwright test tests/e2e/analytics-shell-layout.spec.ts --project=chromium --grep "console"
```

Expected before fix: at least one test FAILS with the exact Base UI warning and owner stack.

- [ ] **Step 3: Apply the smallest ownership fix**

Make the affected control controlled from its first render or uncontrolled for its entire lifetime. Do not mix `value` and later `defaultValue`, and do not remount the control to silence the warning. Keep radio-card/select synchronization and submitted values unchanged.

- [ ] **Step 4: Verify warning absence and behavior**

```bash
npx vitest run tests/unit/connect-source-form.test.tsx
npx playwright test tests/e2e/analytics-shell-layout.spec.ts --project=chromium --grep "console"
```

Expected: PASS and zero error/warning messages on affected routes.

- [ ] **Step 5: Commit**

```bash
git add src/components/integrations/connect-source-form.tsx tests/unit/connect-source-form.test.tsx tests/e2e/analytics-shell-layout.spec.ts
git commit -m "fix: keep base ui controls consistently controlled"
```

Stage a different implementation file only if the captured stack proves a different owner.

---

## Task 8: Verify analytics and shell as a releasable slice

**Files:**

- Modify only if verified stale seams remain: `apps/web/tests/e2e/app-shell-routes.spec.ts`
- Capture: light/dark screenshots for `/reports`, `/dashboard`, and one integration detail

- [ ] **Step 1: Run focused unit checks**

```bash
npm run typecheck
npx vitest run tests/unit/report-command-bar.test.tsx tests/unit/report-charts.test.tsx tests/unit/app-nav-shell.test.tsx tests/unit/app-nav.test.tsx tests/unit/integration-ui-layout.test.tsx tests/unit/connect-source-form.test.tsx
```

Expected: exit 0.

- [ ] **Step 2: Run focused browser checks**

```bash
npx playwright test tests/e2e/analytics-shell-layout.spec.ts tests/e2e/app-shell-routes.spec.ts --project=chromium
```

Expected: exit 0 at all four widths with no console warning/error.

- [ ] **Step 3: Perform side-by-side visual inspection**

Compare identical routes, states, widths, and themes. Verify:

- report controls never collapse;
- populated charts have visible series, target, point states, axes, and tooltip;
- nav has no horizontal scrollbar and retains all destinations;
- integration facts, statuses, URLs, and actions have clear hierarchy;
- no decorative gradient, glass surface, double-bezel, excessive radius, or status-color misuse was introduced.

- [ ] **Step 4: Run the production build**

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 5: Commit only evidence-driven final adjustments**

```bash
git add tests/e2e/app-shell-routes.spec.ts
git commit -m "test: verify analytics and shell remediation"
```

Skip this commit if no file changed.
