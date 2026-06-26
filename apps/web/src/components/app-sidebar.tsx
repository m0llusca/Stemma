import { AppSidebarShell } from "@/components/app-sidebar-shell";
import { AuthRequiredError, getWorkspaceUsers, isDemoAuthEnabled } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { getShellSnapshot, type ShellSnapshot } from "@/lib/shell/snapshot";
import { switchCurrentUser } from "@/lib/user-actions";

export async function AppSidebar() {
  const snapshot = await getShellSnapshot().catch((error: unknown) => {
    if (error instanceof AuthRequiredError) {
      return null;
    }

    throw error;
  });

  if (!snapshot) {
    return null;
  }

  const [signals, demoSwitcher] = await Promise.all([
    SidebarAsyncSignals({ user: snapshot.user, navItems: snapshot.navItems }),
    isDemoAuthEnabled() ? DemoUserSwitcher({ user: snapshot.user }) : null
  ]);

  return (
    <AppSidebarShell items={snapshot.navItems} branding={snapshot.branding}>
      {signals}
      {demoSwitcher}
    </AppSidebarShell>
  );
}

async function SidebarAsyncSignals({ user, navItems }: { user: ShellSnapshot["user"]; navItems: ShellSnapshot["navItems"] }) {
  const [finalizedAppealConversations, queuedCount, activeTrainingCount] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        workspaceId: user.workspaceId,
        ...(user.role === "SUPPORT_AGENT" ? { assigneeName: user.name } : {}),
        qaStatus: "FINALIZED"
      },
      select: {
        reviews: {
          where: {
            reviewSource: "HUMAN",
            status: "FINALIZED"
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 1,
          select: {
            appealStatus: true
          }
        }
      }
    }),
    prisma.conversation.count({
      where: {
        workspaceId: user.workspaceId,
        ...(user.role === "SUPPORT_AGENT" ? { assigneeName: user.name } : {}),
        qaStatus: "QUEUED"
      }
    }),
    prisma.trainingAssignment.count({
      where: {
        workspaceId: user.workspaceId,
        ...(user.role === "SUPPORT_AGENT" ? { assigneeId: user.id } : {}),
        status: { not: "done" }
      }
    })
  ]);
  const openAppealCount = finalizedAppealConversations.filter((conversation) => conversation.reviews[0]?.appealStatus === "open").length;
  const signals = [
    navItems.some((item) => item.href === "/reviews") && queuedCount > 0 ? { label: "Очередь", value: queuedCount } : null,
    (navItems.some((item) => item.href === "/self-review") || navItems.some((item) => item.href === "/reviews")) && openAppealCount > 0
      ? { label: "Апелляции", value: openAppealCount }
      : null,
    navItems.some((item) => item.href === "/coaching") && activeTrainingCount > 0 ? { label: "Обучение", value: activeTrainingCount } : null
  ].filter((signal): signal is { label: string; value: number } => Boolean(signal));

  if (signals.length === 0) {
    return null;
  }

  return (
    <div className="soft-callout">
      <div className="grid gap-2">
        {signals.map((signal) => (
          <div key={signal.label} className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-300">
            <span>{signal.label}</span>
            <strong className="text-sm text-white">{signal.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

async function DemoUserSwitcher({ user }: { user: ShellSnapshot["user"] }) {
  const users = await getWorkspaceUsers(user.workspaceId);

  return (
    <form action={switchCurrentUser} className="soft-callout">
      <input type="hidden" name="returnTo" value="/reviews" />
      <label className="grid gap-1 text-xs font-semibold uppercase text-slate-400">
        Роль
        <select name="userId" defaultValue={user.id} className="form-control min-w-0 text-sm font-medium normal-case">
          {users.map((workspaceUser) => (
            <option key={workspaceUser.id} value={workspaceUser.id}>
              {workspaceUser.name}
            </option>
          ))}
        </select>
        <span className="text-xs font-medium normal-case text-slate-400">{roleLabels[user.role]}</span>
      </label>
      <button type="submit" className="app-sidebar__role-submit action-button min-h-[36px] px-3 py-2 text-sm">
        Переключить
      </button>
    </form>
  );
}
