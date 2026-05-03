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
    <section className="review-conversation-panel panel overflow-hidden">
      <div className="review-conversation-panel__header flex items-center justify-between gap-3 border-b border-[#d9e0ea] px-5 py-4">
        <h2 className="text-lg font-semibold">Таймлайн диалога</h2>
        <span className="text-sm text-[#64748b]">{formatMessageCount(messages.length)}</span>
      </div>
      <div className="review-conversation-panel__body record-list px-5">
        {messages.map((message) => {
          const isHighlighted = highlightedMessages.has(message.id);

          return (
            <article
              key={message.id}
              className={`conversation-message ${isHighlighted ? "conversation-message--selected" : ""}`}
            >
              <div className="conversation-message__header">
                <span className="conversation-message__author">{message.authorName}</span>
                <span className="conversation-message__role">
                  {participantLabels[message.participantType]}
                </span>
                {isHighlighted ? (
                  <span className="conversation-message__evidence">Доказательство</span>
                ) : null}
                {message.isPrivate ? (
                  <span className="conversation-message__private">Приватно</span>
                ) : null}
                <div className="message-toolbar">
                  <time className="text-xs text-[#64748b]" dateTime={message.sentAt.toISOString()}>
                    {message.sentAt.toLocaleString("ru-RU")}
                  </time>
                  <EvidenceMessageButton messageId={message.id} />
                </div>
              </div>
              <p className="conversation-message__body">{message.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
