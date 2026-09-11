import { Suspense } from "react";
import { AppNavFallback } from "@/components/app-nav-fallback";
import { AppNavPulseChrome } from "@/components/app-nav-pulse-chrome";
import { AppNavShell } from "@/components/app-nav-shell";
import { DemoRoleSwitchMenu } from "@/components/auth/demo-role-switch";
import { getDemoRoleSwitcher } from "@/lib/auth/demo-switcher";
import { isAuthEntryRequest } from "@/lib/auth/request-path";
import { hasPermission } from "@/lib/auth/permissions";
import { canSeeOpsQueuePulse, roleHomePath } from "@/lib/auth/role-home";
import { AuthRequiredError } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { getShellSnapshot, type ShellSnapshot } from "@/lib/shell/snapshot";
import { visibleTopNavAreas } from "@/lib/shell/navigation";

export async function AppNav() {
  return buildAppNav({ resolveSignals: false });
}

/**
 * Unit-test helper: awaits pulse/demo so RTL receives a fully resolved tree.
 * Production `AppNav` streams those as async signals (see docs/app-shell.md).
 */
export async function AppNavForTests() {
  return buildAppNav({ resolveSignals: true });
}

async function buildAppNav({ resolveSignals }: { resolveSignals: boolean }) {
  // Path first: QC_DEMO_AUTH no-cookie fallback can impersonate a seeded user,
  // so "unauthenticated" is not enough to keep login free of product chrome.
  if (await isAuthEntryRequest()) {
    return null;
  }

  const snapshot = await getShellSnapshot().catch((error: unknown) => {
    if (error instanceof AuthRequiredError) {
      return null;
    }

    throw error;
  });

  if (!snapshot) {
    return null;
  }

  // VIEWER has no product areas or ⌘K destinations. Full chrome over
  // `/auth/pending-access` reads as a broken empty shell, not a holding state.
  // The page already shows identity + logout.
  if (snapshot.user.role === "VIEWER") {
    return null;
  }

  const shellProps = {
    navigation: snapshot.navigation,
    areas: visibleTopNavAreas(snapshot.user.role, { name: snapshot.user.name }),
    homeHref: roleHomePath(snapshot.user.role, { name: snapshot.user.name }),
    canTakeNextCase: hasPermission(snapshot.user.role, "reviews:write"),
    user: {
      name: snapshot.user.name,
      email: snapshot.user.email,
      roleLabel: roleLabels[snapshot.user.role]
    },
    branding: snapshot.branding
  };

  if (resolveSignals) {
    const [pulseItems, demoSwitcher] = await Promise.all([
      getNavPulseItems(snapshot.user),
      getDemoRoleSwitcher(snapshot.user)
    ]);

    return (
      <Suspense fallback={<AppNavFallback />}>
        <AppNavShell
          {...shellProps}
          pulseSlot={<AppNavPulseChrome items={pulseItems} />}
          demoMenuSlot={
            demoSwitcher ? <DemoRoleSwitchMenu switcher={demoSwitcher} /> : null
          }
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<AppNavFallback />}>
      <AppNavShell
        {...shellProps}
        pulseSlot={
          <Suspense key="nav-pulse-slot" fallback={null}>
            <AppNavPulseSignal user={snapshot.user} />
          </Suspense>
        }
        demoMenuSlot={
          <Suspense key="nav-demo-menu-slot" fallback={null}>
            <AppNavDemoMenuSignal user={snapshot.user} />
          </Suspense>
        }
      />
    </Suspense>
  );
}

async function AppNavPulseSignal({ user }: { user: ShellSnapshot["user"] }) {
  const items = await getNavPulseItems(user);
  return <AppNavPulseChrome items={items} />;
}

async function AppNavDemoMenuSignal({ user }: { user: ShellSnapshot["user"] }) {
  const demoSwitcher = await getDemoRoleSwitcher(user);
  if (!demoSwitcher) {
    return null;
  }

  return <DemoRoleSwitchMenu switcher={demoSwitcher} />;
}

type PulseItem = {
  href: string;
  label: string;
  value: number;
  tone?: "neutral" | "risk" | "warning";
};

/**
 * Каждый pulse-item гейтится правом своей цели — иначе роль (например VIEWER без
 * прав, достижимая через SSO-маппинг) видит счётчики и упирается в «Недостаточно
 * прав» по клику. Скрытые счётчики не запрашиваем: если права нет — запроса нет.
 */
export async function getNavPulseItems(user: ShellSnapshot["user"]): Promise<PulseItem[]> {
  // Очередь/Риск are ops-queue chrome. reviews:read is not enough — SUPPORT_AGENT
  // and EXEC both hold it, but their JTBD is self-review and risk narrative.
  const canSeeOpsPulse = canSeeOpsQueuePulse(user.role);
  const canAccessTraining =
    hasPermission(user.role, "training:manage") || hasPermission(user.role, "training:consume");

  const [queuedCount, highRiskCount, trainingCount] = await Promise.all([
    canSeeOpsPulse
      ? prisma.conversation.count({
          where: { workspaceId: user.workspaceId, qaStatus: "QUEUED" }
        })
      : Promise.resolve(0),
    canSeeOpsPulse
      ? prisma.review.count({
          where: {
            workspaceId: user.workspaceId,
            status: "FINALIZED",
            reviewSource: "HUMAN",
            findings: { some: { riskLevel: { in: ["HIGH", "CRITICAL"] } } }
          }
        })
      : Promise.resolve(0),
    canAccessTraining
      ? prisma.trainingAssignment.count({
          where: {
            workspaceId: user.workspaceId,
            status: { not: "done" },
            ...(user.role === "SUPPORT_AGENT" ? { assigneeId: user.id } : {})
          }
        })
      : Promise.resolve(0)
  ]);

  const items: PulseItem[] = [];
  if (canSeeOpsPulse) {
    items.push({ href: "/reviews?qaStatus=QUEUED", label: "Очередь", value: queuedCount });
    items.push({
      href: "/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL",
      label: "Риск",
      value: highRiskCount,
      tone: highRiskCount > 0 ? "risk" : "neutral"
    });
  }
  if (canAccessTraining) {
    items.push({ href: "/coaching", label: "Обучение", value: trainingCount, tone: trainingCount > 0 ? "warning" : "neutral" });
  }

  return items;
}
