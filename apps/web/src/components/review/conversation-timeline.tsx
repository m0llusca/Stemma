import type { Message } from "@prisma/client";
import { formatMessageCount, participantLabels } from "@/lib/labels";

type ConversationTimelineProps = {
  messages: Message[];
};

export function ConversationTimeline({ messages }: ConversationTimelineProps) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Таймлайн диалога</h2>
        <span className="text-sm text-[#667085]">{formatMessageCount(messages.length)}</span>
      </div>
      <div className="space-y-4">
        {messages.map((message) => (
          <article key={message.id} className="rounded-lg border border-[#d7dce5] bg-[#f7f8fb] p-4">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-semibold text-[#17202a]">{message.authorName}</span>
              <span className="rounded bg-white px-2 py-1 text-xs font-medium text-[#475467]">
                {participantLabels[message.participantType]}
              </span>
              {message.isPrivate ? (
                <span className="rounded bg-[#fff4ed] px-2 py-1 text-xs font-medium text-[#b54708]">Приватно</span>
              ) : null}
              <time className="ml-auto text-xs text-[#667085]" dateTime={message.sentAt.toISOString()}>
                {message.sentAt.toLocaleString("ru-RU")}
              </time>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-[#344054]">{message.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
