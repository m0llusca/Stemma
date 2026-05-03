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

      <section className="panel overflow-hidden">
        <div className="border-b border-[#d9e0ea] px-5 py-4">
          <h2 className="text-lg font-semibold">Мои обращения</h2>
          <p className="mt-1 text-sm text-[#64748b]">Сначала видны последние закрытые обращения.</p>
        </div>
        <div className="record-list px-5">
              {conversations.map((conversation) => {
                const selfReview = conversation.reviews[0];

                return (
                  <article key={conversation.id} className="record-card record-card--interactive">
                    <div className="record-row">
                      <div className="min-w-0">
                        <h3 className="record-title">{conversation.subject}</h3>
                        <p className="record-meta mt-1">{externalSourceLabel(conversation.externalSource)} · {conversation.externalId}</p>
                      </div>
                      <span className={`pill ${selfReview ? "pill--ok" : "pill--neutral"}`}>
                        {selfReview ? `${Math.round(selfReview.totalScore)}%` : "Нет самооценки"}
                      </span>
                    </div>
                    <div className="record-row">
                      <p className="record-meta">
                        Канал: {channelLabels[conversation.channel]} · CSAT: {conversation.csatScore ?? csatBucketLabels[conversation.csatBucket]}
                      </p>
                      <Link
                        href={`/reviews/${conversation.id}?reviewSource=SELF_REVIEW&returnTo=${encodeURIComponent("/self-review")}`}
                        className="text-sm font-semibold text-[#1d3fae] hover:underline"
                      >
                        Оценить себя
                      </Link>
                    </div>
                  </article>
                );
              })}
        </div>
      </section>
    </section>
  );
}
