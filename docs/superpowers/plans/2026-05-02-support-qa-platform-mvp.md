# Support QA Platform MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working digital-first support QA MVP where a QA analyst imports conversations, reviews them on an Investigation Board, scores them with a versioned scorecard, records findings, and sees basic reports.

**Architecture:** Create a single Next.js App Router web app in `apps/web`. Keep domain logic in focused TypeScript modules, persist MVP data with Prisma + SQLite, and expose custom ingest/export APIs through Next.js route handlers. Native connectors are not implemented in Phase 1, but the data model and integration diagnostics are shaped for Zendesk and Znuny/OTRS/OTOBO in Phase 2.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Prisma, SQLite, Zod, Vitest, Testing Library, Playwright, npm.

---

## Scope

This plan implements Phase 1 from the design spec and prepares extension points for Phase 2.

Included:

- Next.js application scaffold under `apps/web`.
- Prisma schema, SQLite database, seed data.
- Manual QA review queue.
- Investigation Board.
- Scorecard scoring and finalization.
- Findings and coaching actions.
- CSV/JSON-style seed import path through custom API.
- Basic dashboard reports.
- Audit log and role-aware UI gates.
- Unit, contract, and e2e tests.

Deferred:

- Zendesk connector implementation.
- Znuny/OTRS/OTOBO GenericInterface connector implementation.
- AutoQA.
- Voice/call transcripts.
- SSO/SCIM.

## File Structure

Create:

- `apps/web/package.json` - web app package scripts and dependencies.
- `apps/web/next.config.ts` - Next.js config.
- `apps/web/tsconfig.json` - TypeScript config.
- `apps/web/tailwind.config.ts` - Tailwind content config.
- `apps/web/postcss.config.mjs` - Tailwind PostCSS config.
- `apps/web/src/app/globals.css` - app styles.
- `apps/web/src/app/layout.tsx` - app shell layout.
- `apps/web/src/app/page.tsx` - redirects to review queue.
- `apps/web/src/app/reviews/page.tsx` - QA queue page.
- `apps/web/src/app/reviews/[conversationId]/page.tsx` - Investigation Board page.
- `apps/web/src/app/reports/page.tsx` - MVP reporting dashboard.
- `apps/web/src/app/admin/scorecards/page.tsx` - minimal scorecard administration.
- `apps/web/src/app/admin/integrations/page.tsx` - integration readiness page.
- `apps/web/src/app/api/conversations/route.ts` - custom conversation ingest API.
- `apps/web/src/app/api/conversations/[id]/messages/route.ts` - custom message ingest API.
- `apps/web/src/app/api/reviews/export/route.ts` - review export API.
- `apps/web/src/components/app-sidebar.tsx` - navigation.
- `apps/web/src/components/review/conversation-timeline.tsx` - message timeline.
- `apps/web/src/components/review/review-panel.tsx` - scoring and finding form.
- `apps/web/src/components/review/queue-table.tsx` - queue table.
- `apps/web/src/components/reports/metric-card.tsx` - dashboard metric.
- `apps/web/src/lib/audit.ts` - audit logging.
- `apps/web/src/lib/current-user.ts` - MVP session/role helper.
- `apps/web/src/lib/db.ts` - Prisma singleton.
- `apps/web/src/lib/review-actions.ts` - server actions for review mutations.
- `apps/web/src/lib/review-repository.ts` - read/write repository for review UI.
- `apps/web/src/lib/score.ts` - pure score calculation.
- `apps/web/src/lib/normalizers/custom-api.ts` - custom API payload normalization.
- `apps/web/src/lib/validation/custom-api.ts` - Zod schemas.
- `apps/web/src/generated/prisma/.gitkeep` - marker file for generated Prisma client directory.
- `apps/web/prisma/schema.prisma` - database schema.
- `apps/web/prisma/seed.ts` - seed data.
- `apps/web/vitest.config.ts` - unit test config.
- `apps/web/playwright.config.ts` - e2e config.
- `apps/web/tests/unit/score.test.ts` - score tests.
- `apps/web/tests/unit/custom-api-normalizer.test.ts` - normalizer tests.
- `apps/web/tests/api/conversations.test.ts` - route contract tests.
- `apps/web/tests/e2e/review-workflow.spec.ts` - Playwright review flow.
- `apps/web/.env.example` - documented local env.

Modify:

- `AGENTS.md` - add local project notes for app location and commands.
- `.gitignore` - ignore app build artifacts, database files, and visual companion state.

## Task 1: Scaffold The Web App Workspace

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/.env.example`
- Modify: `.gitignore`
- Modify: `AGENTS.md`

- [ ] **Step 1: Initialize Git if needed**

Run:

```bash
git rev-parse --is-inside-work-tree || git init
```

Expected: either `true` or a new repository initialized in `/Users/dubrsky/Downloads/qc_app`.

- [ ] **Step 2: Create the app directory**

Run:

```bash
mkdir -p apps/web/src/app apps/web/src/components apps/web/src/lib apps/web/prisma apps/web/tests/unit apps/web/tests/api apps/web/tests/e2e
```

Expected: directories exist.

- [ ] **Step 3: Add `apps/web/package.json`**

Create `apps/web/package.json`:

```json
{
  "name": "support-qa-platform-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "db:reset": "prisma migrate reset --force"
  },
  "dependencies": {
    "@prisma/client": "^7.6.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "next": "^16.2.2",
    "prisma": "^7.6.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.58.2",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "jsdom": "^25.0.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 4: Add base configs**

Create `apps/web/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

Create `apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `apps/web/postcss.config.mjs`:

```js
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};

export default config;
```

Create `apps/web/tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {}
  },
  plugins: []
};

export default config;
```

- [ ] **Step 5: Add the shell UI**

Create `apps/web/src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #f7f8fb;
  --foreground: #17202a;
  --muted: #667085;
  --panel: #ffffff;
  --border: #d7dce5;
  --accent: #116466;
  --accent-strong: #0b4f52;
  --danger: #b42318;
  --warning: #b54708;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
input,
select,
textarea {
  font: inherit;
}

.page {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  min-height: 100vh;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
}
```

Create `apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";

export const metadata: Metadata = {
  title: "Support QA",
  description: "Quality control for support conversations"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="page">
          <AppSidebar />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
```

Create `apps/web/src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/reviews");
}
```

Create `apps/web/src/components/app-sidebar.tsx`:

```tsx
import Link from "next/link";
import { BarChart3, ClipboardCheck, Gauge, Settings } from "lucide-react";

const navItems = [
  { href: "/reviews", label: "Reviews", icon: ClipboardCheck },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/scorecards", label: "Scorecards", icon: Gauge },
  { href: "/admin/integrations", label: "Integrations", icon: Settings }
];

export function AppSidebar() {
  return (
    <aside className="border-r border-[#d7dce5] bg-white px-4 py-5">
      <div className="mb-7">
        <div className="text-lg font-semibold">Support QA</div>
        <div className="text-sm text-[#667085]">Manual quality review</div>
      </div>
      <nav className="grid gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#344054] hover:bg-[#eef4f4]"
            >
              <Icon size={17} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 6: Add environment example and ignores**

Create `apps/web/.env.example`:

```dotenv
DATABASE_URL="file:./dev.db"
```

Create or update `.gitignore`:

```gitignore
node_modules/
.next/
dist/
coverage/
playwright-report/
test-results/
*.db
*.db-journal
.env
.env.local
.superpowers/
apps/web/src/generated/prisma/*
!apps/web/src/generated/prisma/.gitkeep
```

Append to `AGENTS.md`:

```md

# Project Notes

- Web app lives in `apps/web`.
- Use `npm install` from `apps/web` before running app commands.
- Local database is SQLite via Prisma at `apps/web/prisma/dev.db`.
- Primary commands: `npm run dev`, `npm run test`, `npm run test:e2e`, `npm run typecheck`.
```

- [ ] **Step 7: Install dependencies**

Run:

```bash
cd apps/web && npm install
```

Expected: `package-lock.json` is created and dependencies install successfully.

- [ ] **Step 8: Run the first checks**

Run:

```bash
cd apps/web && npm run typecheck
```

Expected: TypeScript reports no errors.

- [ ] **Step 9: Commit**

Run:

```bash
git add .gitignore AGENTS.md apps/web
git commit -m "chore: scaffold support qa web app"
```

Expected: commit succeeds.

## Task 2: Add Prisma Schema And Seed Data

**Files:**

- Create: `apps/web/prisma/schema.prisma`
- Create: `apps/web/prisma/seed.ts`
- Create: `apps/web/src/lib/db.ts`
- Create: `apps/web/src/generated/prisma/.gitkeep`

- [ ] **Step 1: Write the Prisma schema**

Create `apps/web/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

enum RoleName {
  ADMIN
  QA_ANALYST
  VIEWER
}

enum ConversationChannel {
  CHAT
  EMAIL
  TICKET
  MESSENGER
}

enum ParticipantType {
  CUSTOMER
  HUMAN_AGENT
  AI_AGENT
  SYSTEM
}

enum ReviewSource {
  HUMAN
  AI
  CALIBRATION
}

enum ReviewStatus {
  DRAFT
  FINALIZED
}

enum CriterionKind {
  SCALE_1_3
  PASS_FAIL
}

enum FindingOwnerType {
  AGENT
  PROCESS
  PRODUCT
  POLICY
  AI_SYSTEM
}

enum RiskLevel {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

model Workspace {
  id            String         @id @default(cuid())
  name          String
  users         User[]
  integrations  Integration[]
  conversations Conversation[]
  scorecards    Scorecard[]
  reviews       Review[]
  auditLogs     AuditLog[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

model User {
  id          String     @id @default(cuid())
  workspaceId String
  workspace   Workspace  @relation(fields: [workspaceId], references: [id])
  email       String
  name        String
  role        RoleName
  reviews     Review[]
  auditLogs   AuditLog[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@unique([workspaceId, email])
}

model Integration {
  id           String    @id @default(cuid())
  workspaceId  String
  workspace    Workspace @relation(fields: [workspaceId], references: [id])
  source       String
  displayName  String
  status       String
  syncCursor   String?
  lastSyncedAt DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model Conversation {
  id             String              @id @default(cuid())
  workspaceId    String
  workspace      Workspace           @relation(fields: [workspaceId], references: [id])
  externalSource String
  externalId     String
  externalUrl    String?
  channel        ConversationChannel
  subject        String
  status         String
  tags           String
  customerName   String
  assigneeName   String?
  samplingReason String
  riskHint       String?
  openedAt       DateTime
  closedAt       DateTime?
  messages       Message[]
  reviews        Review[]
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  @@unique([workspaceId, externalSource, externalId])
}

model Message {
  id              String          @id @default(cuid())
  conversationId  String
  conversation    Conversation    @relation(fields: [conversationId], references: [id])
  externalId      String
  participantType ParticipantType
  authorName      String
  body            String
  sentAt          DateTime
  isPrivate       Boolean         @default(false)
  createdAt       DateTime        @default(now())

  @@unique([conversationId, externalId])
}

model Scorecard {
  id          String               @id @default(cuid())
  workspaceId String
  workspace   Workspace            @relation(fields: [workspaceId], references: [id])
  name        String
  version     Int
  isActive    Boolean              @default(true)
  criteria    ScorecardCriterion[]
  reviews     Review[]
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
}

model ScorecardCriterion {
  id          String        @id @default(cuid())
  scorecardId String
  scorecard   Scorecard     @relation(fields: [scorecardId], references: [id])
  key         String
  label       String
  kind        CriterionKind
  weight      Int
  required    Boolean       @default(true)
  order       Int
  scores      CriterionScore[]
}

model Review {
  id             String           @id @default(cuid())
  workspaceId    String
  workspace      Workspace        @relation(fields: [workspaceId], references: [id])
  conversationId String
  conversation   Conversation     @relation(fields: [conversationId], references: [id])
  reviewerId     String
  reviewer       User             @relation(fields: [reviewerId], references: [id])
  scorecardId    String
  scorecard      Scorecard        @relation(fields: [scorecardId], references: [id])
  reviewSource   ReviewSource
  rubricVersion  Int
  status         ReviewStatus
  totalScore     Float
  confidence     Float?
  summary        String
  finalizedAt    DateTime?
  scores         CriterionScore[]
  findings       Finding[]
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
}

model CriterionScore {
  id          String             @id @default(cuid())
  reviewId    String
  review      Review             @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  criterionId String
  criterion   ScorecardCriterion @relation(fields: [criterionId], references: [id])
  value       Int?
  passed      Boolean?
  isNotApplicable Boolean        @default(false)
  comment     String
  evidenceMessageId String?
}

model Finding {
  id              String           @id @default(cuid())
  reviewId        String
  review          Review           @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  ownerType       FindingOwnerType
  category        String
  rootCause       String
  riskLevel       RiskLevel
  evidenceSummary String
  coachingAction  CoachingAction?
  createdAt       DateTime         @default(now())
}

model CoachingAction {
  id          String   @id @default(cuid())
  findingId   String   @unique
  finding     Finding  @relation(fields: [findingId], references: [id], onDelete: Cascade)
  assignee    String
  action      String
  dueAt       DateTime?
  status      String   @default("open")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model AuditLog {
  id          String    @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  actorId     String
  actor       User      @relation(fields: [actorId], references: [id])
  action      String
  targetType  String
  targetId    String
  metadata    String
  createdAt   DateTime  @default(now())
}
```

- [ ] **Step 2: Add Prisma client helper**

Create `apps/web/src/generated/prisma/.gitkeep`:

```text
```

Create `apps/web/src/lib/db.ts`:

```ts
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 3: Add seed data**

Create `apps/web/prisma/seed.ts`:

```ts
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.coachingAction.deleteMany();
  await prisma.finding.deleteMany();
  await prisma.criterionScore.deleteMany();
  await prisma.review.deleteMany();
  await prisma.scorecardCriterion.deleteMany();
  await prisma.scorecard.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();

  const workspace = await prisma.workspace.create({
    data: { name: "Demo Support QA" }
  });

  const admin = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "admin@example.com",
      name: "Admin User",
      role: "ADMIN"
    }
  });

  const analyst = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "qa@example.com",
      name: "QA Analyst",
      role: "QA_ANALYST"
    }
  });

  const scorecard = await prisma.scorecard.create({
    data: {
      workspaceId: workspace.id,
      name: "Digital Support QA",
      version: 1,
      criteria: {
        create: [
          { key: "accuracy", label: "Accuracy", kind: "SCALE_1_3", weight: 30, order: 1 },
          { key: "resolution", label: "Resolution quality", kind: "SCALE_1_3", weight: 25, order: 2 },
          { key: "policy", label: "Policy and compliance", kind: "PASS_FAIL", weight: 20, order: 3 },
          { key: "tone", label: "Tone and empathy", kind: "SCALE_1_3", weight: 15, order: 4 },
          { key: "clarity", label: "Writing clarity", kind: "SCALE_1_3", weight: 10, order: 5 }
        ]
      }
    }
  });

  const conversation = await prisma.conversation.create({
    data: {
      workspaceId: workspace.id,
      externalSource: "demo_import",
      externalId: "conv-1001",
      externalUrl: "https://example.com/tickets/1001",
      channel: "CHAT",
      subject: "Refund request after delayed delivery",
      status: "closed",
      tags: "refund,delivery,high-value",
      customerName: "Mila Petrova",
      assigneeName: "Ivan Support",
      samplingReason: "High risk: refund policy",
      riskHint: "Potential policy miss",
      openedAt: new Date("2026-04-25T10:00:00.000Z"),
      closedAt: new Date("2026-04-25T10:18:00.000Z"),
      messages: {
        create: [
          {
            externalId: "msg-1",
            participantType: "CUSTOMER",
            authorName: "Mila Petrova",
            body: "My delivery is late and I want a refund.",
            sentAt: new Date("2026-04-25T10:00:00.000Z")
          },
          {
            externalId: "msg-2",
            participantType: "HUMAN_AGENT",
            authorName: "Ivan Support",
            body: "I can help. The order is still in transit, so we can offer store credit today or a refund after carrier confirmation.",
            sentAt: new Date("2026-04-25T10:04:00.000Z")
          },
          {
            externalId: "msg-3",
            participantType: "CUSTOMER",
            authorName: "Mila Petrova",
            body: "Store credit works if it arrives this week.",
            sentAt: new Date("2026-04-25T10:09:00.000Z")
          },
          {
            externalId: "msg-4",
            participantType: "HUMAN_AGENT",
            authorName: "Ivan Support",
            body: "I issued store credit and added a carrier follow-up. You will get an update by Friday.",
            sentAt: new Date("2026-04-25T10:18:00.000Z")
          }
        ]
      }
    }
  });

  await prisma.integration.createMany({
    data: [
      {
        workspaceId: workspace.id,
        source: "zendesk",
        displayName: "Zendesk",
        status: "planned"
      },
      {
        workspaceId: workspace.id,
        source: "otrs_family",
        displayName: "Znuny / OTRS / OTOBO",
        status: "planned"
      }
    ]
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: workspace.id,
      actorId: admin.id,
      action: "seed.created",
      targetType: "workspace",
      targetId: workspace.id,
      metadata: JSON.stringify({ analystId: analyst.id, scorecardId: scorecard.id, conversationId: conversation.id })
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 4: Migrate and seed**

Run:

```bash
cd apps/web
cp .env.example .env
npm run db:migrate -- --name init
npm run db:seed
```

Expected: migration succeeds, seed completes without throwing.

- [ ] **Step 5: Verify generated client and data**

Run:

```bash
cd apps/web && npx prisma studio --browser none
```

Expected: Prisma Studio starts and shows seeded tables. Stop it with `Ctrl+C`.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/web/prisma apps/web/src/lib/db.ts apps/web/src/generated/prisma apps/web/.env.example apps/web/package.json apps/web/package-lock.json
git commit -m "feat: add prisma data model and seed data"
```

Expected: commit succeeds.

## Task 3: Implement Scoring Logic With Unit Tests

**Files:**

- Create: `apps/web/src/lib/score.ts`
- Create: `apps/web/tests/unit/score.test.ts`
- Create: `apps/web/vitest.config.ts`

- [ ] **Step 1: Add Vitest config**

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
```

- [ ] **Step 2: Write failing score tests**

Create `apps/web/tests/unit/score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateReviewScore } from "@/lib/score";

describe("calculateReviewScore", () => {
  it("calculates weighted score for 1-3 scale and pass-fail criteria", () => {
    const result = calculateReviewScore([
      { key: "accuracy", kind: "SCALE_1_3", weight: 30, value: 3 },
      { key: "resolution", kind: "SCALE_1_3", weight: 25, value: 2 },
      { key: "policy", kind: "PASS_FAIL", weight: 20, passed: true },
      { key: "tone", kind: "SCALE_1_3", weight: 15, value: 3 },
      { key: "clarity", kind: "SCALE_1_3", weight: 10, value: 2 }
    ]);

    expect(result.totalScore).toBe(86.67);
    expect(result.maxWeight).toBe(100);
  });

  it("removes not-applicable criteria from denominator", () => {
    const result = calculateReviewScore([
      { key: "accuracy", kind: "SCALE_1_3", weight: 50, value: 3 },
      { key: "policy", kind: "PASS_FAIL", weight: 50, isNotApplicable: true }
    ]);

    expect(result.totalScore).toBe(100);
    expect(result.maxWeight).toBe(50);
  });

  it("throws when required values are missing", () => {
    expect(() =>
      calculateReviewScore([{ key: "accuracy", kind: "SCALE_1_3", weight: 30 }])
    ).toThrow("Missing scale score for accuracy");
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
cd apps/web && npm run test -- tests/unit/score.test.ts
```

Expected: FAIL because `@/lib/score` does not exist.

- [ ] **Step 4: Implement score calculation**

Create `apps/web/src/lib/score.ts`:

```ts
export type CriterionInput = {
  key: string;
  kind: "SCALE_1_3" | "PASS_FAIL";
  weight: number;
  value?: number | null;
  passed?: boolean | null;
  isNotApplicable?: boolean;
};

export type ScoreResult = {
  totalScore: number;
  maxWeight: number;
};

function roundTwo(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateReviewScore(criteria: CriterionInput[]): ScoreResult {
  let earned = 0;
  let maxWeight = 0;

  for (const criterion of criteria) {
    if (criterion.isNotApplicable) {
      continue;
    }

    maxWeight += criterion.weight;

    if (criterion.kind === "SCALE_1_3") {
      if (criterion.value == null) {
        throw new Error(`Missing scale score for ${criterion.key}`);
      }
      if (criterion.value < 1 || criterion.value > 3) {
        throw new Error(`Scale score for ${criterion.key} must be between 1 and 3`);
      }
      earned += (criterion.value / 3) * criterion.weight;
      continue;
    }

    if (criterion.passed == null) {
      throw new Error(`Missing pass-fail score for ${criterion.key}`);
    }
    earned += criterion.passed ? criterion.weight : 0;
  }

  if (maxWeight === 0) {
    return { totalScore: 0, maxWeight: 0 };
  }

  return {
    totalScore: roundTwo((earned / maxWeight) * 100),
    maxWeight
  };
}
```

- [ ] **Step 5: Run tests to verify pass**

Run:

```bash
cd apps/web && npm run test -- tests/unit/score.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/web/src/lib/score.ts apps/web/tests/unit/score.test.ts apps/web/vitest.config.ts apps/web/package.json apps/web/package-lock.json
git commit -m "feat: add review score calculation"
```

Expected: commit succeeds.

## Task 4: Implement Review Repository And Queue Page

**Files:**

- Create: `apps/web/src/lib/current-user.ts`
- Create: `apps/web/src/lib/review-repository.ts`
- Create: `apps/web/src/components/review/queue-table.tsx`
- Create: `apps/web/src/app/reviews/page.tsx`

- [ ] **Step 1: Add MVP current user helper**

Create `apps/web/src/lib/current-user.ts`:

```ts
import { prisma } from "@/lib/db";

export async function getCurrentUser() {
  const user = await prisma.user.findFirst({
    where: { role: "QA_ANALYST" },
    include: { workspace: true }
  });

  if (!user) {
    throw new Error("Seeded QA analyst is missing. Run npm run db:seed.");
  }

  return user;
}

export function canFinalizeReview(role: string) {
  return role === "ADMIN" || role === "QA_ANALYST";
}
```

- [ ] **Step 2: Add repository reads**

Create `apps/web/src/lib/review-repository.ts`:

```ts
import { prisma } from "@/lib/db";

export async function getReviewQueue(workspaceId: string) {
  return prisma.conversation.findMany({
    where: { workspaceId },
    include: {
      messages: { orderBy: { sentAt: "asc" } },
      reviews: { orderBy: { createdAt: "desc" }, take: 1 }
    },
    orderBy: [{ closedAt: "desc" }, { openedAt: "desc" }]
  });
}

export async function getConversationForReview(workspaceId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    include: {
      messages: { orderBy: { sentAt: "asc" } },
      reviews: {
        include: {
          reviewer: true,
          scores: { include: { criterion: true } },
          findings: { include: { coachingAction: true } }
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });
}

export async function getActiveScorecard(workspaceId: string) {
  const scorecard = await prisma.scorecard.findFirst({
    where: { workspaceId, isActive: true },
    include: { criteria: { orderBy: { order: "asc" } } },
    orderBy: { version: "desc" }
  });

  if (!scorecard) {
    throw new Error("Active scorecard is missing. Run npm run db:seed.");
  }

  return scorecard;
}
```

- [ ] **Step 3: Add queue table component**

Create `apps/web/src/components/review/queue-table.tsx`:

```tsx
import Link from "next/link";
import type { Conversation, Message, Review } from "@/generated/prisma/client";

type QueueConversation = Conversation & {
  messages: Message[];
  reviews: Review[];
};

export function QueueTable({ conversations }: { conversations: QueueConversation[] }) {
  return (
    <div className="panel overflow-hidden">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-[#f2f4f7] text-left text-[#475467]">
          <tr>
            <th className="px-4 py-3 font-medium">Conversation</th>
            <th className="px-4 py-3 font-medium">Channel</th>
            <th className="px-4 py-3 font-medium">Assignee</th>
            <th className="px-4 py-3 font-medium">Reason</th>
            <th className="px-4 py-3 font-medium">Review</th>
          </tr>
        </thead>
        <tbody>
          {conversations.map((conversation) => {
            const latestReview = conversation.reviews[0];
            return (
              <tr key={conversation.id} className="border-t border-[#eaecf0]">
                <td className="px-4 py-3">
                  <Link className="font-medium text-[#116466]" href={`/reviews/${conversation.id}`}>
                    {conversation.subject}
                  </Link>
                  <div className="text-xs text-[#667085]">{conversation.customerName}</div>
                </td>
                <td className="px-4 py-3">{conversation.channel.toLowerCase()}</td>
                <td className="px-4 py-3">{conversation.assigneeName ?? "Unassigned"}</td>
                <td className="px-4 py-3">{conversation.samplingReason}</td>
                <td className="px-4 py-3">
                  {latestReview ? `${latestReview.totalScore}%` : "Not reviewed"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Add queue page**

Create `apps/web/src/app/reviews/page.tsx`:

```tsx
import { QueueTable } from "@/components/review/queue-table";
import { getCurrentUser } from "@/lib/current-user";
import { getReviewQueue } from "@/lib/review-repository";

export default async function ReviewsPage() {
  const user = await getCurrentUser();
  const conversations = await getReviewQueue(user.workspaceId);

  return (
    <section className="px-8 py-7">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Review queue</h1>
          <p className="mt-1 text-sm text-[#667085]">
            Select conversations for manual QA review.
          </p>
        </div>
        <div className="rounded-md border border-[#d7dce5] bg-white px-3 py-2 text-sm">
          {conversations.length} conversations
        </div>
      </div>
      <QueueTable conversations={conversations} />
    </section>
  );
}
```

- [ ] **Step 5: Run local check**

Run:

```bash
cd apps/web && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/web/src/lib/current-user.ts apps/web/src/lib/review-repository.ts apps/web/src/components/review/queue-table.tsx apps/web/src/app/reviews/page.tsx
git commit -m "feat: add review queue"
```

Expected: commit succeeds.

## Task 5: Implement Investigation Board And Review Finalization

**Files:**

- Create: `apps/web/src/lib/audit.ts`
- Create: `apps/web/src/lib/review-actions.ts`
- Create: `apps/web/src/components/review/conversation-timeline.tsx`
- Create: `apps/web/src/components/review/review-panel.tsx`
- Create: `apps/web/src/app/reviews/[conversationId]/page.tsx`

- [ ] **Step 1: Add audit helper**

Create `apps/web/src/lib/audit.ts`:

```ts
import { prisma } from "@/lib/db";

export async function auditLog(input: {
  workspaceId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: JSON.stringify(input.metadata ?? {})
    }
  });
}
```

- [ ] **Step 2: Add review server action**

Create `apps/web/src/lib/review-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { canFinalizeReview, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { calculateReviewScore } from "@/lib/score";

export async function finalizeReview(formData: FormData) {
  const user = await getCurrentUser();
  if (!canFinalizeReview(user.role)) {
    throw new Error("Current user cannot finalize reviews");
  }

  const conversationId = String(formData.get("conversationId"));
  const scorecardId = String(formData.get("scorecardId"));
  const summary = String(formData.get("summary") ?? "");
  const rootCause = String(formData.get("rootCause") ?? "");
  const category = String(formData.get("category") ?? "agent_behavior");
  const ownerType = String(formData.get("ownerType") ?? "AGENT") as "AGENT" | "PROCESS" | "PRODUCT" | "POLICY" | "AI_SYSTEM";
  const riskLevel = String(formData.get("riskLevel") ?? "LOW") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  const evidenceSummary = String(formData.get("evidenceSummary") ?? "");
  const coachingAction = String(formData.get("coachingAction") ?? "");

  const scorecard = await prisma.scorecard.findFirstOrThrow({
    where: { id: scorecardId, workspaceId: user.workspaceId },
    include: { criteria: { orderBy: { order: "asc" } } }
  });

  const scoreInputs = scorecard.criteria.map((criterion) => {
    const raw = formData.get(`criterion.${criterion.id}`);
    const isNotApplicable = formData.get(`criterion.${criterion.id}.na`) === "on";
    if (criterion.kind === "PASS_FAIL") {
      return {
        key: criterion.key,
        kind: criterion.kind,
        weight: criterion.weight,
        passed: raw === "pass",
        isNotApplicable
      };
    }
    return {
      key: criterion.key,
      kind: criterion.kind,
      weight: criterion.weight,
      value: raw ? Number(raw) : null,
      isNotApplicable
    };
  });

  const result = calculateReviewScore(scoreInputs);

  const review = await prisma.review.create({
    data: {
      workspaceId: user.workspaceId,
      conversationId,
      reviewerId: user.id,
      scorecardId,
      reviewSource: "HUMAN",
      rubricVersion: scorecard.version,
      status: "FINALIZED",
      totalScore: result.totalScore,
      summary,
      finalizedAt: new Date(),
      scores: {
        create: scorecard.criteria.map((criterion, index) => ({
          criterionId: criterion.id,
          value: scoreInputs[index].kind === "SCALE_1_3" ? scoreInputs[index].value ?? null : null,
          passed: scoreInputs[index].kind === "PASS_FAIL" ? scoreInputs[index].passed ?? null : null,
          isNotApplicable: Boolean(scoreInputs[index].isNotApplicable),
          comment: String(formData.get(`criterion.${criterion.id}.comment`) ?? "")
        }))
      },
      findings: {
        create: {
          ownerType,
          category,
          rootCause,
          riskLevel,
          evidenceSummary,
          coachingAction: coachingAction
            ? {
                create: {
                  assignee: "Team Lead",
                  action: coachingAction,
                  status: "open"
                }
              }
            : undefined
        }
      }
    }
  });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "review.finalized",
    targetType: "review",
    targetId: review.id,
    metadata: { conversationId, totalScore: result.totalScore }
  });

  revalidatePath("/reviews");
  revalidatePath(`/reviews/${conversationId}`);
  redirect(`/reviews/${conversationId}`);
}
```

- [ ] **Step 3: Add timeline component**

Create `apps/web/src/components/review/conversation-timeline.tsx`:

```tsx
import type { Message } from "@/generated/prisma/client";

export function ConversationTimeline({ messages }: { messages: Message[] }) {
  return (
    <div className="panel p-4">
      <h2 className="mb-4 text-base font-semibold">Conversation timeline</h2>
      <div className="grid gap-3">
        {messages.map((message) => (
          <article key={message.id} className="rounded-md border border-[#eaecf0] p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-[#667085]">
              <span>
                {message.authorName} · {message.participantType.toLowerCase().replace("_", " ")}
              </span>
              <time dateTime={message.sentAt.toISOString()}>
                {message.sentAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add review panel component**

Create `apps/web/src/components/review/review-panel.tsx`:

```tsx
import type { Scorecard, ScorecardCriterion } from "@/generated/prisma/client";
import { finalizeReview } from "@/lib/review-actions";

type ReviewPanelProps = {
  conversationId: string;
  scorecard: Scorecard & { criteria: ScorecardCriterion[] };
};

export function ReviewPanel({ conversationId, scorecard }: ReviewPanelProps) {
  return (
    <form action={finalizeReview} className="panel grid gap-4 p-4">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="scorecardId" value={scorecard.id} />

      <div>
        <h2 className="text-base font-semibold">{scorecard.name}</h2>
        <p className="text-sm text-[#667085]">Version {scorecard.version}</p>
      </div>

      {scorecard.criteria.map((criterion) => (
        <fieldset key={criterion.id} className="rounded-md border border-[#eaecf0] p-3">
          <legend className="px-1 text-sm font-medium">{criterion.label}</legend>
          <div className="mt-2 grid gap-2">
            {criterion.kind === "SCALE_1_3" ? (
              <select
                name={`criterion.${criterion.id}`}
                className="rounded-md border border-[#d7dce5] px-2 py-2 text-sm"
                defaultValue="3"
              >
                <option value="3">3 - Strong</option>
                <option value="2">2 - Acceptable</option>
                <option value="1">1 - Needs improvement</option>
              </select>
            ) : (
              <select
                name={`criterion.${criterion.id}`}
                className="rounded-md border border-[#d7dce5] px-2 py-2 text-sm"
                defaultValue="pass"
              >
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
              </select>
            )}
            <label className="flex items-center gap-2 text-xs text-[#667085]">
              <input type="checkbox" name={`criterion.${criterion.id}.na`} />
              Not applicable
            </label>
            <textarea
              name={`criterion.${criterion.id}.comment`}
              className="min-h-16 rounded-md border border-[#d7dce5] px-2 py-2 text-sm"
              placeholder="Evidence or notes"
            />
          </div>
        </fieldset>
      ))}

      <label className="grid gap-1 text-sm">
        Review summary
        <textarea name="summary" className="min-h-20 rounded-md border border-[#d7dce5] px-3 py-2" required />
      </label>

      <label className="grid gap-1 text-sm">
        Root cause
        <input name="rootCause" className="rounded-md border border-[#d7dce5] px-3 py-2" required />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">
          Owner
          <select name="ownerType" className="rounded-md border border-[#d7dce5] px-3 py-2">
            <option value="AGENT">Agent</option>
            <option value="PROCESS">Process</option>
            <option value="PRODUCT">Product</option>
            <option value="POLICY">Policy</option>
            <option value="AI_SYSTEM">AI system</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Risk
          <select name="riskLevel" className="rounded-md border border-[#d7dce5] px-3 py-2">
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        Category
        <input name="category" className="rounded-md border border-[#d7dce5] px-3 py-2" defaultValue="agent_behavior" />
      </label>

      <label className="grid gap-1 text-sm">
        Evidence summary
        <textarea name="evidenceSummary" className="min-h-16 rounded-md border border-[#d7dce5] px-3 py-2" required />
      </label>

      <label className="grid gap-1 text-sm">
        Coaching action
        <textarea name="coachingAction" className="min-h-16 rounded-md border border-[#d7dce5] px-3 py-2" />
      </label>

      <button className="rounded-md bg-[#116466] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b4f52]">
        Complete review
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Add Investigation Board page**

Create `apps/web/src/app/reviews/[conversationId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { ConversationTimeline } from "@/components/review/conversation-timeline";
import { ReviewPanel } from "@/components/review/review-panel";
import { getCurrentUser } from "@/lib/current-user";
import { getActiveScorecard, getConversationForReview } from "@/lib/review-repository";

export default async function ConversationReviewPage({
  params
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const user = await getCurrentUser();
  const [conversation, scorecard] = await Promise.all([
    getConversationForReview(user.workspaceId, conversationId),
    getActiveScorecard(user.workspaceId)
  ]);

  if (!conversation) {
    notFound();
  }

  const latestReview = conversation.reviews[0];

  return (
    <section className="grid gap-5 px-8 py-7">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{conversation.subject}</h1>
          <p className="mt-1 text-sm text-[#667085]">
            {conversation.externalSource} · {conversation.channel.toLowerCase()} · {conversation.customerName}
          </p>
        </div>
        <div className="panel px-3 py-2 text-sm">
          {latestReview ? `Latest score: ${latestReview.totalScore}%` : "Not reviewed"}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(360px,0.75fr)] gap-5">
        <div className="grid gap-5">
          <div className="panel grid grid-cols-4 gap-3 p-4 text-sm">
            <div>
              <div className="text-xs text-[#667085]">Assignee</div>
              <div>{conversation.assigneeName ?? "Unassigned"}</div>
            </div>
            <div>
              <div className="text-xs text-[#667085]">Sampling reason</div>
              <div>{conversation.samplingReason}</div>
            </div>
            <div>
              <div className="text-xs text-[#667085]">Tags</div>
              <div>{conversation.tags}</div>
            </div>
            <div>
              <div className="text-xs text-[#667085]">Risk hint</div>
              <div>{conversation.riskHint ?? "None"}</div>
            </div>
          </div>
          <ConversationTimeline messages={conversation.messages} />
        </div>
        <ReviewPanel conversationId={conversation.id} scorecard={scorecard} />
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run checks**

Run:

```bash
cd apps/web && npm run typecheck && npm run test
```

Expected: both commands pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/web/src/lib/audit.ts apps/web/src/lib/review-actions.ts apps/web/src/components/review apps/web/src/app/reviews
git commit -m "feat: add investigation board review workflow"
```

Expected: commit succeeds.

## Task 6: Add Custom API Ingest And Export

**Files:**

- Create: `apps/web/src/lib/validation/custom-api.ts`
- Create: `apps/web/src/lib/normalizers/custom-api.ts`
- Create: `apps/web/src/app/api/conversations/route.ts`
- Create: `apps/web/src/app/api/conversations/[id]/messages/route.ts`
- Create: `apps/web/src/app/api/reviews/export/route.ts`
- Create: `apps/web/tests/unit/custom-api-normalizer.test.ts`
- Create: `apps/web/tests/api/conversations.test.ts`

- [ ] **Step 1: Write normalizer test**

Create `apps/web/tests/unit/custom-api-normalizer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeCustomConversation } from "@/lib/normalizers/custom-api";

describe("normalizeCustomConversation", () => {
  it("normalizes a custom ingest payload into internal conversation data", () => {
    const result = normalizeCustomConversation({
      externalSource: "custom_helpdesk",
      externalId: "A-100",
      channel: "chat",
      subject: "Login failed",
      status: "closed",
      customerName: "Alex Customer",
      assigneeName: "Nina Agent",
      tags: ["login", "auth"],
      samplingReason: "manual import",
      openedAt: "2026-04-20T12:00:00.000Z",
      messages: [
        {
          externalId: "m1",
          authorName: "Alex Customer",
          participantType: "customer",
          body: "I cannot log in.",
          sentAt: "2026-04-20T12:00:00.000Z"
        }
      ]
    });

    expect(result.conversation.externalSource).toBe("custom_helpdesk");
    expect(result.conversation.channel).toBe("CHAT");
    expect(result.conversation.tags).toBe("login,auth");
    expect(result.messages[0].participantType).toBe("CUSTOMER");
  });
});
```

- [ ] **Step 2: Run normalizer test to verify failure**

Run:

```bash
cd apps/web && npm run test -- tests/unit/custom-api-normalizer.test.ts
```

Expected: FAIL because normalizer does not exist.

- [ ] **Step 3: Add validation and normalizer**

Create `apps/web/src/lib/validation/custom-api.ts`:

```ts
import { z } from "zod";

export const customMessageSchema = z.object({
  externalId: z.string().min(1),
  participantType: z.enum(["customer", "human_agent", "ai_agent", "system"]),
  authorName: z.string().min(1),
  body: z.string().min(1),
  sentAt: z.string().datetime(),
  isPrivate: z.boolean().optional()
});

export const customConversationSchema = z.object({
  externalSource: z.string().min(1),
  externalId: z.string().min(1),
  externalUrl: z.string().url().optional(),
  channel: z.enum(["chat", "email", "ticket", "messenger"]),
  subject: z.string().min(1),
  status: z.string().min(1),
  customerName: z.string().min(1),
  assigneeName: z.string().optional(),
  tags: z.array(z.string()).default([]),
  samplingReason: z.string().min(1),
  riskHint: z.string().optional(),
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime().optional(),
  messages: z.array(customMessageSchema).default([])
});

export type CustomConversationPayload = z.infer<typeof customConversationSchema>;
export type CustomMessagePayload = z.infer<typeof customMessageSchema>;
```

Create `apps/web/src/lib/normalizers/custom-api.ts`:

```ts
import type { CustomConversationPayload, CustomMessagePayload } from "@/lib/validation/custom-api";

const channelMap = {
  chat: "CHAT",
  email: "EMAIL",
  ticket: "TICKET",
  messenger: "MESSENGER"
} as const;

const participantMap = {
  customer: "CUSTOMER",
  human_agent: "HUMAN_AGENT",
  ai_agent: "AI_AGENT",
  system: "SYSTEM"
} as const;

export function normalizeCustomMessage(message: CustomMessagePayload) {
  return {
    externalId: message.externalId,
    participantType: participantMap[message.participantType],
    authorName: message.authorName,
    body: message.body,
    sentAt: new Date(message.sentAt),
    isPrivate: Boolean(message.isPrivate)
  };
}

export function normalizeCustomConversation(payload: CustomConversationPayload) {
  return {
    conversation: {
      externalSource: payload.externalSource,
      externalId: payload.externalId,
      externalUrl: payload.externalUrl,
      channel: channelMap[payload.channel],
      subject: payload.subject,
      status: payload.status,
      tags: payload.tags.join(","),
      customerName: payload.customerName,
      assigneeName: payload.assigneeName,
      samplingReason: payload.samplingReason,
      riskHint: payload.riskHint,
      openedAt: new Date(payload.openedAt),
      closedAt: payload.closedAt ? new Date(payload.closedAt) : undefined
    },
    messages: payload.messages.map(normalizeCustomMessage)
  };
}
```

- [ ] **Step 4: Add route handlers**

Create `apps/web/src/app/api/conversations/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { normalizeCustomConversation } from "@/lib/normalizers/custom-api";
import { customConversationSchema } from "@/lib/validation/custom-api";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const json = await request.json();
  const payload = customConversationSchema.parse(json);
  const normalized = normalizeCustomConversation(payload);

  const conversation = await prisma.conversation.upsert({
    where: {
      workspaceId_externalSource_externalId: {
        workspaceId: user.workspaceId,
        externalSource: normalized.conversation.externalSource,
        externalId: normalized.conversation.externalId
      }
    },
    create: {
      workspaceId: user.workspaceId,
      ...normalized.conversation,
      messages: { create: normalized.messages }
    },
    update: {
      ...normalized.conversation
    }
  });

  if (normalized.messages.length > 0) {
    for (const message of normalized.messages) {
      await prisma.message.upsert({
        where: {
          conversationId_externalId: {
            conversationId: conversation.id,
            externalId: message.externalId
          }
        },
        create: { ...message, conversationId: conversation.id },
        update: message
      });
    }
  }

  return NextResponse.json({ id: conversation.id }, { status: 201 });
}
```

Create `apps/web/src/app/api/conversations/[id]/messages/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { normalizeCustomMessage } from "@/lib/normalizers/custom-api";
import { customMessageSchema } from "@/lib/validation/custom-api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { id, workspaceId: user.workspaceId }
  });
  const payload = customMessageSchema.parse(await request.json());
  const normalized = normalizeCustomMessage(payload);

  const message = await prisma.message.upsert({
    where: {
      conversationId_externalId: {
        conversationId: conversation.id,
        externalId: normalized.externalId
      }
    },
    create: { ...normalized, conversationId: conversation.id },
    update: normalized
  });

  return NextResponse.json({ id: message.id }, { status: 201 });
}
```

Create `apps/web/src/app/api/reviews/export/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  const reviews = await prisma.review.findMany({
    where: { workspaceId: user.workspaceId },
    include: {
      conversation: true,
      reviewer: true,
      scores: { include: { criterion: true } },
      findings: { include: { coachingAction: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({
    reviews: reviews.map((review) => ({
      id: review.id,
      totalScore: review.totalScore,
      status: review.status,
      conversation: {
        id: review.conversation.id,
        externalSource: review.conversation.externalSource,
        externalId: review.conversation.externalId,
        subject: review.conversation.subject
      },
      reviewer: review.reviewer.email,
      scores: review.scores.map((score) => ({
        criterion: score.criterion.key,
        value: score.value,
        passed: score.passed,
        isNotApplicable: score.isNotApplicable,
        comment: score.comment
      })),
      findings: review.findings.map((finding) => ({
        ownerType: finding.ownerType,
        category: finding.category,
        rootCause: finding.rootCause,
        riskLevel: finding.riskLevel,
        coachingAction: finding.coachingAction?.action ?? null
      }))
    }))
  });
}
```

- [ ] **Step 5: Add route contract test**

Create `apps/web/tests/api/conversations.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const conversationUpsert = vi.fn();
const messageUpsert = vi.fn();

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ workspaceId: "workspace-1" }))
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    conversation: {
      upsert: conversationUpsert
    },
    message: {
      upsert: messageUpsert
    }
  }
}));

import { POST } from "@/app/api/conversations/route";

describe("POST /api/conversations", () => {
  beforeEach(() => {
    conversationUpsert.mockReset();
    messageUpsert.mockReset();
    conversationUpsert.mockResolvedValue({ id: "conv-db-id" });
    messageUpsert.mockResolvedValue({ id: "msg-db-id" });
  });

  it("upserts a conversation and messages from a custom payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/conversations", {
        method: "POST",
        body: JSON.stringify({
          externalSource: "custom_helpdesk",
          externalId: "A-100",
          channel: "chat",
          subject: "Login failed",
          status: "closed",
          customerName: "Alex Customer",
          assigneeName: "Nina Agent",
          tags: ["login"],
          samplingReason: "manual import",
          openedAt: "2026-04-20T12:00:00.000Z",
          messages: [
            {
              externalId: "m1",
              authorName: "Alex Customer",
              participantType: "customer",
              body: "I cannot log in.",
              sentAt: "2026-04-20T12:00:00.000Z"
            }
          ]
        })
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "conv-db-id" });
    expect(conversationUpsert).toHaveBeenCalledOnce();
    expect(messageUpsert).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
cd apps/web && npm run test -- tests/unit/custom-api-normalizer.test.ts tests/api/conversations.test.ts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/web/src/lib/validation apps/web/src/lib/normalizers apps/web/src/app/api apps/web/tests/unit/custom-api-normalizer.test.ts apps/web/tests/api/conversations.test.ts
git commit -m "feat: add custom conversation api"
```

Expected: commit succeeds.

## Task 7: Add Reports, Scorecard Admin, And Integration Readiness Pages

**Files:**

- Create: `apps/web/src/components/reports/metric-card.tsx`
- Create: `apps/web/src/app/reports/page.tsx`
- Create: `apps/web/src/app/admin/scorecards/page.tsx`
- Create: `apps/web/src/app/admin/integrations/page.tsx`

- [ ] **Step 1: Add metric component**

Create `apps/web/src/components/reports/metric-card.tsx`:

```tsx
export function MetricCard({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="panel p-4">
      <div className="text-sm text-[#667085]">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-[#667085]">{detail}</div>
    </div>
  );
}
```

- [ ] **Step 2: Add reports page**

Create `apps/web/src/app/reports/page.tsx`:

```tsx
import { MetricCard } from "@/components/reports/metric-card";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  const [reviews, findings, coachingOpen] = await Promise.all([
    prisma.review.findMany({ where: { workspaceId: user.workspaceId }, include: { conversation: true } }),
    prisma.finding.findMany({ where: { review: { workspaceId: user.workspaceId } } }),
    prisma.coachingAction.count({ where: { status: "open", finding: { review: { workspaceId: user.workspaceId } } } })
  ]);

  const average =
    reviews.length === 0
      ? 0
      : Math.round((reviews.reduce((sum, review) => sum + review.totalScore, 0) / reviews.length) * 100) / 100;
  const highRisk = findings.filter((finding) => finding.riskLevel === "HIGH" || finding.riskLevel === "CRITICAL").length;

  return (
    <section className="px-8 py-7">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="mt-1 text-sm text-[#667085]">MVP quality and coaching indicators.</p>
      <div className="mt-6 grid grid-cols-4 gap-4">
        <MetricCard label="Average score" value={`${average}%`} detail={`${reviews.length} finalized reviews`} />
        <MetricCard label="High-risk findings" value={String(highRisk)} detail="High or critical risk" />
        <MetricCard label="Coaching backlog" value={String(coachingOpen)} detail="Open actions" />
        <MetricCard label="Reviewed sources" value={new Set(reviews.map((review) => review.conversation.externalSource)).size.toString()} detail="Connected data origins" />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add scorecard admin page**

Create `apps/web/src/app/admin/scorecards/page.tsx`:

```tsx
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export default async function ScorecardsPage() {
  const user = await getCurrentUser();
  const scorecards = await prisma.scorecard.findMany({
    where: { workspaceId: user.workspaceId },
    include: { criteria: { orderBy: { order: "asc" } } },
    orderBy: { version: "desc" }
  });

  return (
    <section className="px-8 py-7">
      <h1 className="text-2xl font-semibold">Scorecards</h1>
      <p className="mt-1 text-sm text-[#667085]">Read-only MVP view of active QA rubric versions.</p>
      <div className="mt-6 grid gap-4">
        {scorecards.map((scorecard) => (
          <article key={scorecard.id} className="panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{scorecard.name}</h2>
                <p className="text-sm text-[#667085]">Version {scorecard.version}</p>
              </div>
              <span className="rounded-md bg-[#eef4f4] px-2 py-1 text-xs">
                {scorecard.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <ul className="mt-4 grid gap-2 text-sm">
              {scorecard.criteria.map((criterion) => (
                <li key={criterion.id} className="flex justify-between border-t border-[#eaecf0] pt-2">
                  <span>{criterion.label}</span>
                  <span className="text-[#667085]">{criterion.kind} · weight {criterion.weight}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add integrations readiness page**

Create `apps/web/src/app/admin/integrations/page.tsx`:

```tsx
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

const roadmap = [
  {
    name: "Zendesk",
    priority: "Phase 2",
    notes: "Tickets, comments, users, webhooks, optional private note or tag write-back."
  },
  {
    name: "Znuny / OTRS / OTOBO",
    priority: "Phase 2",
    notes: "GenericInterface setup wizard, TicketSearch, TicketGet, TicketUpdate, TicketHistoryGet, article operations."
  },
  {
    name: "Intercom / Freshdesk / HubSpot",
    priority: "Phase 3",
    notes: "Conversation and ticket APIs with source-specific normalization."
  }
];

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  const integrations = await prisma.integration.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: { displayName: "asc" }
  });

  return (
    <section className="px-8 py-7">
      <h1 className="text-2xl font-semibold">Integrations</h1>
      <p className="mt-1 text-sm text-[#667085]">MVP readiness view for native connector roadmap.</p>
      <div className="mt-6 grid gap-4">
        {roadmap.map((item) => (
          <article key={item.name} className="panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{item.name}</h2>
              <span className="rounded-md bg-[#f2f4f7] px-2 py-1 text-xs">{item.priority}</span>
            </div>
            <p className="mt-2 text-sm text-[#667085]">{item.notes}</p>
          </article>
        ))}
      </div>
      <h2 className="mt-8 text-lg font-semibold">Seeded integration records</h2>
      <ul className="mt-3 grid gap-2 text-sm">
        {integrations.map((integration) => (
          <li key={integration.id} className="panel flex justify-between p-3">
            <span>{integration.displayName}</span>
            <span className="text-[#667085]">{integration.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Run checks**

Run:

```bash
cd apps/web && npm run typecheck && npm run test
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/web/src/components/reports apps/web/src/app/reports apps/web/src/app/admin
git commit -m "feat: add reports and admin readiness views"
```

Expected: commit succeeds.

## Task 8: Add Playwright E2E Coverage

**Files:**

- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/tests/e2e/review-workflow.spec.ts`

- [ ] **Step 1: Add Playwright config**

Create `apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
```

- [ ] **Step 2: Add review workflow e2e test**

Create `apps/web/tests/e2e/review-workflow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("QA analyst can finalize a review", async ({ page }) => {
  await page.goto("/reviews");

  await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
  await page.getByRole("link", { name: /Refund request after delayed delivery/ }).click();

  await expect(page.getByRole("heading", { name: "Refund request after delayed delivery" })).toBeVisible();
  await expect(page.getByText("Conversation timeline")).toBeVisible();

  await page.getByLabel("Review summary").fill("Agent gave a mostly correct answer and set a clear follow-up.");
  await page.getByLabel("Root cause").fill("Policy explanation could be more explicit.");
  await page.getByLabel("Evidence summary").fill("Agent offered credit and follow-up, but did not cite refund policy.");
  await page.getByLabel("Coaching action").fill("Coach agent on refund policy wording.");
  await page.getByRole("button", { name: "Complete review" }).click();

  await expect(page.getByText(/Latest score:/)).toBeVisible();
});
```

- [ ] **Step 3: Run e2e test**

Run:

```bash
cd apps/web && npm run test:e2e
```

Expected: PASS in Chromium.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/web/playwright.config.ts apps/web/tests/e2e/review-workflow.spec.ts apps/web/package.json apps/web/package-lock.json
git commit -m "test: add review workflow e2e coverage"
```

Expected: commit succeeds.

## Task 9: Final Verification And Handoff

**Files:**

- Modify: `docs/superpowers/specs/2026-05-02-support-qa-platform-design.md` only if implementation decisions changed.
- Modify: `docs/superpowers/plans/2026-05-02-support-qa-platform-mvp.md` only if a completed task required a plan correction.

- [ ] **Step 1: Run full verification**

Run:

```bash
cd apps/web
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Start dev server**

Run:

```bash
cd apps/web && npm run dev
```

Expected: server starts on `http://localhost:3000`.

- [ ] **Step 3: Manual smoke test**

Open `http://localhost:3000` and verify:

- `/reviews` shows seeded conversation.
- Opening the conversation shows the Investigation Board.
- Completing a review updates the latest score.
- `/reports` shows average score and coaching backlog.
- `/admin/integrations` lists Zendesk and Znuny/OTRS/OTOBO as Phase 2 priorities.

- [ ] **Step 4: Commit final adjustments**

Run:

```bash
git status --short
git add .
git commit -m "chore: verify support qa mvp"
```

Expected: commit succeeds if there are final changes. If `git status --short` is empty, skip the commit.

## Self-Review

Spec coverage:

- QA analyst MVP workflow is covered by Tasks 4 and 5.
- Scorecards and weighted scoring are covered by Tasks 2, 3, and 5.
- Findings and coaching are covered by Tasks 2, 5, and 7.
- Custom API ingest/export is covered by Task 6.
- Reporting is covered by Task 7.
- Security basics are covered through role helper and audit log in Tasks 2 and 5.
- OTRS-family priority is represented in schema seed data and integration readiness page in Tasks 2 and 7.
- AutoQA, voice, and native connectors remain deferred by scope.

Placeholder scan:

- The plan contains no unresolved marker text or unspecified implementation tasks.

Type consistency:

- `ReviewStatus`, `ReviewSource`, criterion kinds, role names, and risk levels match the Prisma schema and TypeScript code snippets.
- The repository, actions, and UI components share the same `conversationId`, `scorecardId`, `workspaceId`, and score field names.
