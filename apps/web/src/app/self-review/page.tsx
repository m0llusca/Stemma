import Link from "next/link";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { channelLabels, csatBucketLabels, externalSourceLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function SelfReviewPage() {
  const user = await requireCurrentUserPermission("self_review:write");
  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId: user.workspaceId,
      assigneeName: user.role === "SUPPORT_AGENT" ? user.name : undefined
    },
    include: {
      reviews: {
        where: { reviewSource: "SELF_REVIEW" },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    },
    orderBy: { closedAt: "desc" },
    take: 20
  });

  return (
    <section className="page-shell workspace-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Контроль качества</p>
          <h1 className="page-title">Самооценка оператора</h1>
          <p className="page-subtitle">
            Оператор может заранее оценить свои обращения по той же форме. Самооценка не меняет итоговую оценку проверяющего.
          </p>
        </div>
      </div>

      <section className="admin-group">
        <div className="admin-group__header admin-group__header--compact">
          <h2 className="text-base font-semibold text-[#111827]">Мои обращения</h2>
          <p className="text-sm leading-5 text-[#64748b]">Сначала видны последние закрытые обращения.</p>
        </div>
        <div className="grid gap-2">
              {conversations.map((conversation) => {
                const selfReview = conversation.reviews[0];

                return (
                  <Link
                    key={conversation.id}
                    href={`/reviews/${conversation.id}?reviewSource=SELF_REVIEW&returnTo=${encodeURIComponent("/self-review")}`}
                    className="admin-tile admin-tile--compact"
                  >
                    <span className="admin-tile__icon admin-tile__icon--plain">S</span>
                    <span className="admin-tile__body">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="record-title record-title--tight">{conversation.subject}</span>
                      <span className={`pill ${selfReview ? "pill--ok" : "pill--neutral"}`}>
                        {selfReview ? `${Math.round(selfReview.totalScore)}%` : "Нет самооценки"}
                      </span>
                      </span>
                      <span className="record-meta">{externalSourceLabel(conversation.externalSource)} · {conversation.externalId}</span>
                      <span className="record-meta">
                        Канал: {channelLabels[conversation.channel]} · CSAT: {conversation.csatScore ?? csatBucketLabels[conversation.csatBucket]}
                      </span>
                      <span className="quiet-link">
                        Оценить себя
                      </span>
                    </span>
                  </Link>
                );
              })}
        </div>
      </section>
    </section>
  );
}
