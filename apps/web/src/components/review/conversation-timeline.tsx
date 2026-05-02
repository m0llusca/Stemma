import type { Message } from "@prisma/client";
import { EvidenceMessageButton } from "@/components/review/evidence-message-button";
import { formatMessageCount, participantLabels } from "@/lib/labels";

type ConversationTimelineProps = {
  messages: Message[];
  highlightedMessageIds?: string[];
};

export function ConversationTimeline({ messages, highlightedMessageIds = [] }: ConversationTimelineProps) {
  const highlightedMessages = new Set(highlightedMessageIds);

  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Таймлайн диалога</h2>
        <span className="text-sm text-[#667085]">{formatMessageCount(messages.length)}</span>
      </div>
      <div className="space-y-4">
        {messages.map((message) => {
          const isHighlighted = highlightedMessages.has(message.id);

          return (
            <article
              key={message.id}
              className={`rounded-lg border p-4 ${
                isHighlighted ? "border-[#116466] bg-[#eef4f4]" : "border-[#d7dce5] bg-[#f7f8fb]"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <span className="font-semibold text-[#17202a]">{message.authorName}</span>
                <span className="rounded bg-white px-2 py-1 text-xs font-medium text-[#475467]">
                  {participantLabels[message.participantType]}
                </span>
                {isHighlighted ? (
                  <span className="rounded bg-[#116466] px-2 py-1 text-xs font-semibold text-white">Доказательство</span>
                ) : null}
                {message.isPrivate ? (
                  <span className="rounded bg-[#fff4ed] px-2 py-1 text-xs font-medium text-[#b54708]">Приватно</span>
                ) : null}
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <time className="text-xs text-[#667085]" dateTime={message.sentAt.toISOString()}>
                    {message.sentAt.toLocaleString("ru-RU")}
                  </time>
                  <EvidenceMessageButton messageId={message.id} />
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-[#344054]">{message.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
