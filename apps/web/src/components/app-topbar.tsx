import { Bell, BookOpenCheck, ClipboardCheck, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { AuthRequiredError, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export async function AppTopbar() {
  const currentUser = await getCurrentUser().catch((error: unknown) => {
    if (error instanceof AuthRequiredError) {
      return null;
    }

    throw error;
  });

  if (!currentUser) {
    return null;
  }

  const conversationScope = currentUser.role === "SUPPORT_AGENT" ? { assigneeName: currentUser.name } : {};
  const [queuedCount, highRiskCount, trainingCount] = await Promise.all([
    prisma.conversation.count({
      where: { workspaceId: currentUser.workspaceId, qaStatus: "QUEUED", ...conversationScope }
    }),
    prisma.review.count({
      where: {
        workspaceId: currentUser.workspaceId,
        status: "FINALIZED",
        reviewSource: "HUMAN",
        findings: { some: { riskLevel: { in: ["HIGH", "CRITICAL"] } } },
        ...(currentUser.role === "SUPPORT_AGENT" ? { conversation: { assigneeName: currentUser.name } } : {})
      }
    }),
    prisma.trainingAssignment.count({
      where: {
        workspaceId: currentUser.workspaceId,
        status: { not: "done" },
        ...(currentUser.role === "SUPPORT_AGENT" ? { assigneeId: currentUser.id } : {})
      }
    })
  ]);

  return (
    <header className="app-topbar" aria-label="Глобальная панель">
      <div className="app-topbar__inner">
        <form action="/reviews" className="app-topbar__search">
          <Search size={15} aria-hidden="true" />
          <input name="q" type="search" placeholder="Поиск тикетов, клиентов, тегов" aria-label="Поиск по проверкам" />
        </form>

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

        <Link href="/reviews?status=unreviewed" className="app-topbar__primary">
          <ClipboardCheck size={15} aria-hidden="true" />
          Начать проверку
        </Link>
        <span className="app-topbar__user" title={currentUser.email}>
          <Bell size={14} aria-hidden="true" />
          {currentUser.name}
        </span>
      </div>
    </header>
  );
}
