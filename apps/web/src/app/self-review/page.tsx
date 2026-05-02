import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { channelLabels, csatBucketLabels } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function SelfReviewPage() {
  const user = await getCurrentUser();
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
    <section className="page-shell">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#667085]">Контроль качества</p>
        <h1 className="mt-1 text-2xl font-semibold">Самооценка оператора</h1>
        <p className="mt-1 max-w-3xl text-sm leading-5 text-[#667085]">
          Оператор может заранее оценить свои обращения по той же форме. Самооценка не меняет итоговую оценку проверяющего.
        </p>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-[#d7dce5] px-5 py-4">
          <h2 className="text-lg font-semibold">Мои обращения</h2>
          <p className="mt-1 text-sm text-[#667085]">Сначала видны последние закрытые обращения.</p>
        </div>
        <div className="scroll-area">
          <table className="table-fixed-copy w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
              <tr>
                <th className="px-5 py-3 font-semibold">Обращение</th>
                <th className="px-5 py-3 font-semibold">Канал</th>
                <th className="px-5 py-3 font-semibold">CSAT</th>
                <th className="px-5 py-3 font-semibold">Самооценка</th>
                <th className="px-5 py-3 font-semibold">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d7dce5]">
              {conversations.map((conversation) => {
                const selfReview = conversation.reviews[0];

                return (
                  <tr key={conversation.id}>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-[#17202a]">{conversation.subject}</p>
                      <p className="mt-1 text-xs text-[#667085]">{conversation.externalSource} · {conversation.externalId}</p>
                    </td>
                    <td className="px-5 py-4 text-[#344054]">{channelLabels[conversation.channel]}</td>
                    <td className="px-5 py-4 text-[#344054]">{conversation.csatScore ?? csatBucketLabels[conversation.csatBucket]}</td>
                    <td className="px-5 py-4 font-semibold text-[#17202a]">
                      {selfReview ? `${Math.round(selfReview.totalScore)}%` : "Нет"}
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/reviews/${conversation.id}?reviewSource=SELF_REVIEW&returnTo=${encodeURIComponent("/self-review")}`}
                        className="font-semibold text-[#0b4f52] hover:underline"
                      >
                        Оценить себя
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
