import { Bell, BookOpenCheck, ClipboardCheck, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { AuthRequiredError } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getShellSnapshot, type ShellSnapshot } from "@/lib/shell/snapshot";

export async function AppTopbar() {
  const snapshot = await getShellSnapshot().catch((error: unknown) => {
    if (error instanceof AuthRequiredError) {
      return null;
    }

    throw error;
  });

  if (!snapshot) {
    return null;
  }

  return (
    <header className="app-topbar" aria-label="Глобальная панель">
      <div className="app-topbar__inner">
        <form action="/reviews" className="app-topbar__search">
          <Search size={15} aria-hidden="true" />
          <input name="q" type="search" placeholder="Поиск тикетов, клиентов, тегов" aria-label="Поиск по проверкам" />
        </form>

        <TopbarAsyncSignals user={snapshot.user} />

        <Link href="/reviews?status=unreviewed" className="app-topbar__primary">
          <ClipboardCheck size={15} aria-hidden="true" />
          Начать проверку
        </Link>
        <span className="app-topbar__user" title={snapshot.user.email}>
          <Bell size={14} aria-hidden="true" />
          {snapshot.user.name}
        </span>
      </div>
    </header>
  );
}

async function TopbarAsyncSignals({ user }: { user: ShellSnapshot["user"] }) {
  const conversationScope = user.role === "SUPPORT_AGENT" ? { assigneeName: user.name } : {};
  const [queuedCount, highRiskCount, trainingCount] = await Promise.all([
    prisma.conversation.count({
      where: { workspaceId: user.workspaceId, qaStatus: "QUEUED", ...conversationScope }
    }),
    prisma.review.count({
      where: {
        workspaceId: user.workspaceId,
        status: "FINALIZED",
        reviewSource: "HUMAN",
        findings: { some: { riskLevel: { in: ["HIGH", "CRITICAL"] } } },
        ...(user.role === "SUPPORT_AGENT" ? { conversation: { assigneeName: user.name } } : {})
      }
    }),
    prisma.trainingAssignment.count({
      where: {
        workspaceId: user.workspaceId,
        status: { not: "done" },
        ...(user.role === "SUPPORT_AGENT" ? { assigneeId: user.id } : {})
      }
    })
  ]);

  return (
    <div className="app-topbar__signals" aria-label="Рабочие сигналы">
      <Link href="/reviews?qaStatus=QUEUED" className="app-topbar__signal">
        <ClipboardCheck size={14} aria-hidden="true" />
        Очередь
        <strong>{queuedCount}</strong>
      </Link>
      <Link href="/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL" className="app-topbar__signal app-topbar__signal--risk">
        <TriangleAlert size={14} aria-hidden="true" />
        Риск
        <strong>{highRiskCount}</strong>
      </Link>
      <Link href="/coaching" className="app-topbar__signal">
        <BookOpenCheck size={14} aria-hidden="true" />
        Обучение
        <strong>{trainingCount}</strong>
      </Link>
    </div>
  );
}
