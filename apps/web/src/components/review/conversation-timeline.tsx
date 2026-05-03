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
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[#d9e0ea] px-5 py-4">
        <h2 className="text-lg font-semibold">Таймлайн диалога</h2>
        <span className="text-sm text-[#64748b]">{formatMessageCount(messages.length)}</span>
      </div>
      <div className="record-list px-5">
        {messages.map((message) => {
          const isHighlighted = highlightedMessages.has(message.id);

          return (
            <article
              key={message.id}
              className={`record-card ${
                isHighlighted ? "record-card--selected" : ""
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <span className="font-semibold text-[#111827]">{message.authorName}</span>
                <span className="rounded bg-white px-2 py-1 text-xs font-medium text-[#475569]">
                  {participantLabels[message.participantType]}
                </span>
                {isHighlighted ? (
                  <span className="rounded bg-[#3157d5] px-2 py-1 text-xs font-semibold text-white">Доказательство</span>
                ) : null}
                {message.isPrivate ? (
                  <span className="rounded bg-[#fff7ed] px-2 py-1 text-xs font-medium text-[#b45309]">Приватно</span>
                ) : null}
                <div className="message-toolbar">
                  <time className="text-xs text-[#64748b]" dateTime={message.sentAt.toISOString()}>
                    {message.sentAt.toLocaleString("ru-RU")}
                  </time>
                  <EvidenceMessageButton messageId={message.id} />
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-[#334155]">{message.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
