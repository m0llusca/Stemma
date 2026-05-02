import type { Conversation, Message, Review } from "@prisma/client";
import Link from "next/link";

type QueueConversation = Conversation & {
  messages: Message[];
  reviews: Review[];
};

type QueueTableProps = {
  conversations: QueueConversation[];
};

export function QueueTable({ conversations }: QueueTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#d7dce5] bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
          <tr>
            <th className="px-4 py-3 font-semibold">Conversation</th>
            <th className="px-4 py-3 font-semibold">Channel</th>
            <th className="px-4 py-3 font-semibold">Assignee</th>
            <th className="px-4 py-3 font-semibold">Reason</th>
            <th className="px-4 py-3 font-semibold">Review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#d7dce5]">
          {conversations.map((conversation) => {
            const latestReview = conversation.reviews[0];

            return (
              <tr key={conversation.id} className="hover:bg-[#f7f8fb]">
                <td className="px-4 py-4">
                  <Link href={`/reviews/${conversation.id}`} className="font-medium text-[#0b4f52] hover:underline">
                    {conversation.subject}
                  </Link>
                  <div className="mt-1 text-xs text-[#667085]">
                    {conversation.customerName} · {conversation.messages.length} messages
                  </div>
                </td>
                <td className="px-4 py-4 text-[#344054]">{conversation.channel}</td>
                <td className="px-4 py-4 text-[#344054]">{conversation.assigneeName ?? "Unassigned"}</td>
                <td className="px-4 py-4 text-[#344054]">{conversation.samplingReason}</td>
                <td className="px-4 py-4 font-medium text-[#17202a]">
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
