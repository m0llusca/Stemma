# Shadcn Review Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the `/reviews` queue and `/reviews/:conversationId` timeline geometry after the shadcn/ui migration without restoring legacy CSS.

**Architecture:** Keep data loading, query parsing, permissions, and server actions in the route Server Components. Add one bounded `QueueWorkspace` compound component that owns queue geometry and one private client island that exposes sticky presentation state through `data-state`. Keep `MasterDetail` as the detail-page layout owner and move message geometry into `ConversationTimeline`.

**Tech Stack:** Next.js 16 App Router, React 19 Server/Client Components, TypeScript, Tailwind CSS v4, shadcn/ui on Base UI, Vitest + Testing Library, Playwright.

## Global Constraints

- Approved specification: `docs/superpowers/specs/2026-07-27-shadcn-layout-remediation-design.md`.
- Do not import `src/app/styles/theme.css` or `src/app/styles/components/*`.
- Do not alter repository queries, server actions, hrefs, Russian product copy, permissions, or Prisma schema.
- Use `@/components/ui/*`, Base UI `render`, Lucide, and existing semantic tokens.
- Do not expose `className`, breakpoint, column width, or sticky offset on `QueueWorkspace`.
- Preserve all unrelated dirty-worktree changes. Stage only files named by the current task.
- Before editing, run `git status --short` and record the state of every path
  listed by the task. The commit
  commands below assume those targets were clean; for a pre-existing dirty file,
  stage only new hunks with `git add -p` and inspect `git diff --cached`. If an
  overlapping hunk cannot be isolated safely, leave it uncommitted and report it.
- Run commands from `apps/web`.

---

## Task 1: Add observable queue/detail geometry checks

**Files:**

- Create: `apps/web/tests/e2e/helpers/layout.ts`
- Create: `apps/web/tests/e2e/reviews-layout.spec.ts`
- Modify: `apps/web/tests/e2e/helpers/auth.ts`

- [ ] **Step 1: Add reusable geometry readers**

```ts
import { expect, type Locator, type Page } from "@playwright/test";

export async function expectNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

export async function rect(locator: Locator) {
  await expect(locator).toBeVisible();
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}
```

- [ ] **Step 2: Write the failing queue geometry test**

Use the existing demo sign-in helper, query only stable roles and the approved slots, and cover the four target widths:

```ts
const cases = [
  { width: 390, columns: 1, sideBySide: false },
  { width: 768, columns: 2, sideBySide: false },
  { width: 1280, columns: 4, sideBySide: true },
  { width: 1440, columns: 4, sideBySide: true }
] as const;

for (const scenario of cases) {
  test(`queue geometry at ${scenario.width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width: scenario.width, height: 900 });
    const admin = await prisma.user.findFirstOrThrow({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    await signInE2EUser(context, admin, "reviews-layout");
    await page.goto("/reviews");

    const workspace = page.locator('[data-slot="review-queue-workspace"]');
    const kpis = page.locator('[data-slot="review-queue-kpis"]');
    const list = page.locator('[data-slot="review-queue-list"]');
    const preview = page.locator('[data-slot="review-queue-preview"]');

    await expect(workspace).toBeVisible();
    expect(await kpis.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length))
      .toBe(scenario.columns);
    const [listBox, previewBox] = await Promise.all([rect(list), rect(preview)]);
    expect(Math.abs(listBox.y - previewBox.y) < 8).toBe(scenario.sideBySide);
    await expectNoDocumentOverflow(page);
  });
}
```

- [ ] **Step 3: Add the failing timeline geometry case**

Select a seeded conversation through Prisma, open its detail page, and assert that avatar/content occupy separate columns and a long message stays within its article:

```ts
const message = page.locator('[data-slot="conversation-message"]').first();
const avatar = message.locator('[data-slot="conversation-message-avatar"]');
const content = message.locator('[data-slot="conversation-message-content"]');
const [messageBox, avatarBox, contentBox] = await Promise.all([
  rect(message),
  rect(avatar),
  rect(content)
]);

expect(contentBox.x).toBeGreaterThan(avatarBox.x + avatarBox.width);
expect(contentBox.x + contentBox.width).toBeLessThanOrEqual(messageBox.x + messageBox.width + 1);
await expectNoDocumentOverflow(page);
```

- [ ] **Step 4: Run the new spec and confirm the red baseline**

Run:

```bash
npx playwright test tests/e2e/reviews-layout.spec.ts --project=chromium
```

Expected: FAIL because the approved queue slots do not exist and the legacy queue/timeline geometry is broken.

- [ ] **Step 5: Commit the red regression tests**

```bash
git add tests/e2e/helpers/layout.ts tests/e2e/reviews-layout.spec.ts tests/e2e/helpers/auth.ts
git commit -m "test: capture broken review workspace geometry"
```

---

## Task 2: Introduce the server-safe QueueWorkspace contract

**Files:**

- Create: `apps/web/src/components/review/queue-workspace.tsx`
- Create: `apps/web/tests/unit/queue-workspace.test.tsx`

- [ ] **Step 1: Write the failing compound-component contract test**

```tsx
import { render, screen } from "@testing-library/react";
import { QueueWorkspace } from "@/components/review/queue-workspace";

it("owns queue structure without caller-supplied layout classes", () => {
  const { container } = render(
    <QueueWorkspace description="Разбирайте обращения по SLA" actions={<button>Взять следующий</button>}>
      <QueueWorkspace.Kpis aria-label="Сводка очереди"><div>4 ожидают</div></QueueWorkspace.Kpis>
      <QueueWorkspace.CommandBar aria-label="Фильтры и виды очереди">
        <div>Фильтры</div>
      </QueueWorkspace.CommandBar>
      <QueueWorkspace.Main
        aria-label="Рабочая область очереди"
        preview={<div>Следующий кейс</div>}
        previewLabel="Предпросмотр следующего обращения"
      >
        <div>Список</div>
      </QueueWorkspace.Main>
    </QueueWorkspace>
  );

  expect(screen.getByRole("heading", { name: "Очередь проверок" })).toBeInTheDocument();
  for (const slot of [
    "review-queue-workspace",
    "review-queue-kpis",
    "review-queue-command-sentinel",
    "review-queue-command-bar",
    "review-queue-list",
    "review-queue-preview"
  ]) {
    expect(container.querySelector(`[data-slot="${slot}"]`)).toBeInTheDocument();
  }
});
```

- [ ] **Step 2: Run the unit test and confirm the missing module**

Run:

```bash
npx vitest run tests/unit/queue-workspace.test.tsx
```

Expected: FAIL because `queue-workspace.tsx` does not exist.

- [ ] **Step 3: Implement the bounded public interface**

Implement these public types exactly:

```tsx
type QueueWorkspaceProps = Readonly<{
  description: React.ReactNode;
  actions: React.ReactNode;
  children: React.ReactNode;
}>;

type QueueWorkspaceKpisProps = {
  "aria-label": string;
  children: React.ReactNode;
};

type QueueWorkspaceCommandBarProps = {
  "aria-label": string;
  children: React.ReactNode;
  expandedOnly?: React.ReactNode;
  stuckOnly?: React.ReactNode;
};

type QueueWorkspaceMainProps = {
  "aria-label": string;
  children: React.ReactNode;
  preview?: React.ReactNode;
  previewLabel?: string;
};
```

The root must render the existing `PageShell` with `eyebrow="Контроль качества"` and `title="Очередь проверок"`. Kpis must use `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`. Main must use a single column below `xl`, then `xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]`; the preview follows the list in DOM order and is sticky only at `xl`.

- [ ] **Step 4: Verify the contract test passes**

Run:

```bash
npx vitest run tests/unit/queue-workspace.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the component contract**

```bash
git add src/components/review/queue-workspace.tsx tests/unit/queue-workspace.test.tsx
git commit -m "feat: add review queue workspace contract"
```

---

## Task 3: Replace the fixed sticky shell with CSS sticky + observer state

**Files:**

- Create: `apps/web/src/components/review/queue-command-bar-state.tsx`
- Modify: `apps/web/src/components/review/queue-workspace.tsx`
- Delete: `apps/web/src/components/reports/sticky-command-bar-shell.tsx`
- Delete: `apps/web/tests/unit/sticky-command-bar-shell.test.tsx`
- Modify: `apps/web/tests/unit/queue-workspace.test.tsx`

- [ ] **Step 1: Add a failing presentation-state unit test**

Stub `IntersectionObserver`, capture its callback, render `QueueWorkspace.CommandBar`, then assert:

```tsx
expect(screen.getByLabelText("Фильтры и виды очереди")).toHaveAttribute("data-state", "resting");
act(() => observerCallback([{ isIntersecting: false } as IntersectionObserverEntry], observer));
expect(screen.getByLabelText("Фильтры и виды очереди")).toHaveAttribute("data-state", "stuck");
act(() => observerCallback([{ isIntersecting: true } as IntersectionObserverEntry], observer));
expect(screen.getByLabelText("Фильтры и виды очереди")).toHaveAttribute("data-state", "resting");
```

Also delete assertions about a measured slot height, fixed positioning, generated BEM class names, and scroll listeners.

- [ ] **Step 2: Run the focused unit test**

Run:

```bash
npx vitest run tests/unit/queue-workspace.test.tsx
```

Expected: FAIL because the command bar does not yet observe the sentinel.

- [ ] **Step 3: Implement the private client island**

`queue-command-bar-state.tsx` must:

- start in `resting`;
- observe the supplied sentinel ref with `IntersectionObserver`;
- read `--app-topbar-height` as pixels for `rootMargin`;
- enable state switching only for the desktop media query;
- disconnect on cleanup;
- keep `resting` when `IntersectionObserver` is unavailable;
- never add `scroll`, `resize`, or `requestAnimationFrame` listeners.

The bar itself remains in normal flow:

```tsx
<section
  data-slot="review-queue-command-bar"
  data-state={state}
  className="sticky top-[var(--app-topbar-height)] z-10 min-w-0"
  aria-label={ariaLabel}
>
  <div data-expanded-only>{expandedOnly}</div>
  {children}
  <div data-stuck-only>{stuckOnly}</div>
</section>
```

Use state variants to show/hide presentation-only content. Do not duplicate filter controls.

- [ ] **Step 4: Run the component tests**

Run:

```bash
npx vitest run tests/unit/queue-workspace.test.tsx
```

Expected: PASS, including fallback without `IntersectionObserver`.

- [ ] **Step 5: Remove the obsolete shell and its obsolete tests**

Confirm no consumer remains:

```bash
rg -n "StickyCommandBarShell|queue-controls-bar__slot|queue-controls-bar--stuck" src tests
```

Expected: no matches.

- [ ] **Step 6: Commit the sticky migration**

```bash
git add src/components/review/queue-command-bar-state.tsx src/components/review/queue-workspace.tsx
git add -u src/components/reports/sticky-command-bar-shell.tsx tests/unit/sticky-command-bar-shell.test.tsx
git commit -m "refactor: make review command bar css sticky"
```

---

## Task 4: Migrate the reviews route into QueueWorkspace

**Files:**

- Modify: `apps/web/src/app/reviews/page.tsx`
- Modify: `apps/web/tests/unit/queue-workspace.test.tsx`
- Modify: `apps/web/tests/e2e/quick-views-layout.spec.ts`

- [ ] **Step 1: Add a route-level failing assertion**

Extend the unit contract to server-render a representative workspace composition and assert `actions`, KPIs, expanded saved views, stable filters, list, and preview all have one owner. Do not assert Tailwind class strings.

- [ ] **Step 2: Replace PageShell and legacy layout wrappers**

In `src/app/reviews/page.tsx`:

- replace the route-owned `PageShell` with `QueueWorkspace`;
- move the KPI cards into `QueueWorkspace.Kpis`;
- move saved/quick views to `expandedOnly`;
- move compact queue counts to `stuckOnly`;
- keep one `QueueFilters` instance as `children`;
- move `QueueTable` and pagination into `QueueWorkspace.Main`;
- pass the existing preview card through `preview`;
- remove `reviews-queue-kpis`, `queue-cockpit-layout*`, and sticky magic classes only after their content is represented by the new slots.

- [ ] **Step 3: Rewrite quick-view E2E selectors and sticky expectations**

Replace `.queue-quick-views`, `.queue-controls-bar`, and slot-height assertions with approved slots and computed geometry. Expected sticky checks:

```ts
await expect(commandBar).toHaveAttribute("data-state", "stuck");
expect(await commandBar.evaluate((node) => getComputedStyle(node).position)).toBe("sticky");
expect((await rect(commandBar)).x).toBeGreaterThanOrEqual((await rect(workspace)).x - 1);
await page.evaluate(() => window.scrollTo(0, 0));
await expect(commandBar).toHaveAttribute("data-state", "resting");
```

- [ ] **Step 3a: Cover the no-observer browser fallback**

Create a separate browser context/page before navigation:

```ts
await page.addInitScript(() => {
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    value: undefined
  });
});
await page.goto("/reviews");
await expect(commandBar).toHaveAttribute("data-state", "resting");
expect(await commandBar.evaluate((node) => getComputedStyle(node).position)).toBe("sticky");
await expect(page.getByLabel("Поиск в очереди проверок")).toBeEditable();
```

This is a browser fallback test, not a jsdom substitute for real observer
behavior.

- [ ] **Step 4: Run queue unit and E2E tests**

Run:

```bash
npx vitest run tests/unit/queue-workspace.test.tsx tests/unit/queue-filters.test.tsx tests/unit/queue-advanced-filters.test.tsx
npx playwright test tests/e2e/quick-views-layout.spec.ts tests/e2e/reviews-layout.spec.ts --project=chromium --grep "queue"
```

Expected: PASS for queue composition, repeated quick-view toggles, sticky transitions, column counts, and document overflow.

- [ ] **Step 5: Commit the route migration**

```bash
git add src/app/reviews/page.tsx tests/unit/queue-workspace.test.tsx tests/e2e/quick-views-layout.spec.ts
git commit -m "fix: restore review queue layout"
```

---

## Task 5: Make ConversationTimeline own message geometry

**Files:**

- Modify: `apps/web/src/components/review/conversation-timeline.tsx`
- Create: `apps/web/tests/unit/conversation-timeline.test.tsx`

- [ ] **Step 1: Write the failing accessible-structure test**

Render customer, human-agent, AI-agent, highlighted, private, and long-link messages. Assert approved slots, badges, accessible time, evidence action, and the absence of missing content.

```tsx
expect(container.querySelectorAll('[data-slot="conversation-message"]')).toHaveLength(3);
expect(container.querySelector('[data-party="AI_AGENT"]')).toHaveTextContent("ИИ");
expect(container.querySelector('[data-slot="conversation-message-avatar"]')).toHaveTextContent("МП");
expect(screen.getByText(/очень-длинная-ссылка/)).toBeInTheDocument();
```

- [ ] **Step 2: Run the new test and confirm red**

Run:

```bash
npx vitest run tests/unit/conversation-timeline.test.tsx
```

Expected: FAIL because the new stable message slots are absent.

- [ ] **Step 3: Move all geometry into the component**

Use:

- `article`: `grid grid-cols-[2rem_minmax(0,1fr)] gap-3`;
- avatar: `size-8 shrink-0 rounded-full`;
- content: `min-w-0`;
- header: `flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1`;
- body: `max-w-prose whitespace-pre-wrap break-words`;
- local `data-party` variants for customer, human agent, and AI agent.

Keep coaching pins, evidence buttons, privacy, server actions, message IDs, and ARIA behavior unchanged. Ordinary text must use `break-words`; reserve `break-all` for an explicit technical identifier.

- [ ] **Step 4: Run the timeline test**

Run:

```bash
npx vitest run tests/unit/conversation-timeline.test.tsx tests/unit/review-detail-page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the timeline geometry**

```bash
git add src/components/review/conversation-timeline.tsx tests/unit/conversation-timeline.test.tsx
git commit -m "fix: restore conversation timeline geometry"
```

---

## Task 6: Remove the detail-page layout collision

**Files:**

- Modify: `apps/web/src/app/reviews/[conversationId]/page.tsx`
- Modify: `apps/web/src/components/review/workbench-pane-toggle.tsx`
- Modify: `apps/web/tests/unit/review-detail-page.test.tsx`
- Modify: `apps/web/tests/e2e/reviews-layout.spec.ts`

- [ ] **Step 1: Add a failing detail workbench assertion**

Assert that the route passes no external grid class to `MasterDetail`, both panes remain in DOM, and `data-active-pane` changes the narrow presentation without changing server data.

- [ ] **Step 2: Remove `review-workbench__panes` from the route**

Let `MasterDetail` own its grid. Keep `WorkbenchPaneToggle`, but make its target expose only `data-active-pane`; local variants in the owner decide which pane is visible below 901 px.

- [ ] **Step 3: Extend browser geometry coverage**

At 390/768 assert one active pane is visible and the toggle remains keyboard-operable. At 1280/1440 assert list and detail are side by side, the list remains within its sticky bounds, and the timeline does not overflow.

- [ ] **Step 4: Run detail tests**

Run:

```bash
npx vitest run tests/unit/review-detail-page.test.tsx tests/unit/conversation-timeline.test.tsx
npx playwright test tests/e2e/reviews-layout.spec.ts --project=chromium --grep "detail|timeline"
```

Expected: PASS.

- [ ] **Step 5: Commit the detail layout fix**

```bash
git add 'src/app/reviews/[conversationId]/page.tsx' src/components/review/workbench-pane-toggle.tsx tests/unit/review-detail-page.test.tsx tests/e2e/reviews-layout.spec.ts
git commit -m "fix: restore review detail workbench layout"
```

---

## Task 7: Verify the review workspace as a releasable slice

**Files:**

- Modify if required by verified failures: `apps/web/tests/e2e/review-workflow.spec.ts`
- Modify if required by verified failures: `apps/web/tests/e2e/app-shell-routes.spec.ts`
- Capture: light/dark screenshots for `/reviews` and one `/reviews/:id` route

- [ ] **Step 1: Replace only stale selectors exposed by the migration**

Use role/name or the approved slots. Do not weaken workflow assertions and do not add retries.

- [ ] **Step 2: Run focused verification**

```bash
npm run typecheck
npx vitest run tests/unit/queue-workspace.test.tsx tests/unit/conversation-timeline.test.tsx tests/unit/review-detail-page.test.tsx
npx playwright test tests/e2e/reviews-layout.spec.ts tests/e2e/quick-views-layout.spec.ts tests/e2e/review-workflow.spec.ts --project=chromium
```

Expected: all commands exit 0.

- [ ] **Step 3: Inspect browser console and visual states**

For 390, 768, 1280, and 1440 px in light and dark themes:

- no console errors or warnings;
- KPI grid is 1/2/4/4;
- no document overflow;
- sticky bar does not jump or cover the queue;
- timeline avatar, header, content, and actions remain distinct;
- screenshots are compared side by side with the same route, viewport, theme, and state.

- [ ] **Step 4: Run a production build**

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 5: Commit only verified selector or test adjustments**

```bash
git add tests/e2e/review-workflow.spec.ts tests/e2e/app-shell-routes.spec.ts
git commit -m "test: verify review workspace remediation"
```

Skip this commit if no files changed.
