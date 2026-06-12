import type { Message, RoleName } from "@prisma/client";
import { EvidenceMessageButton } from "@/components/review/evidence-message-button";
import { CoachingPinComposer } from "@/components/review/coaching-pin-composer";
import { deleteCoachingPin, toggleCoachingPinResolved } from "@/lib/coaching-pin-actions";
import { formatMessageCount, participantLabels, roleLabels } from "@/lib/labels";

export type CoachingPinView = {
  id: string;
  messageId: string;
  body: string;
  resolvedAt: Date | null;
  createdAt: Date;
  author: { id: string; name: string; role: RoleName };
};

type ConversationTimelineProps = {
  messages: Message[];
  highlightedMessageIds?: string[];
  conversationId?: string;
  coachingPins?: CoachingPinView[];
  canCoach?: boolean;
  canManagePins?: boolean;
  currentUserId?: string;
};

export function ConversationTimeline({
  messages,
  highlightedMessageIds = [],
  conversationId,
  coachingPins = [],
  canCoach = false,
  canManagePins = false,
  currentUserId
}: ConversationTimelineProps) {
  const highlightedMessages = new Set(highlightedMessageIds);
  const pinsByMessage = new Map<string, CoachingPinView[]>();
  for (const pin of coachingPins) {
    const bucket = pinsByMessage.get(pin.messageId);
    if (bucket) {
      bucket.push(pin);
    } else {
      pinsByMessage.set(pin.messageId, [pin]);
    }
  }

  return (
    <section className="review-conversation-panel panel overflow-hidden">
      <div className="review-conversation-panel__header flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-lg font-semibold">Таймлайн диалога</h2>
        <span className="text-sm text-[var(--text-muted)]">{formatMessageCount(messages.length)}</span>
      </div>
      <div className="review-conversation-panel__body record-list px-5">
        {messages.map((message) => {
          const isHighlighted = highlightedMessages.has(message.id);
          const messagePins = pinsByMessage.get(message.id) ?? [];

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
                {messagePins.length > 0 ? (
                  <span className="conversation-message__pin-count">
                    {messagePins.length === 1 ? "1 заметка" : `${messagePins.length} заметок`}
                  </span>
                ) : null}
                {message.isPrivate ? (
                  <span className="conversation-message__private">Приватно</span>
                ) : null}
                <div className="message-toolbar">
                  <time className="text-xs text-[var(--text-muted)]" dateTime={message.sentAt.toISOString()}>
                    {message.sentAt.toLocaleString("ru-RU")}
                  </time>
                  <EvidenceMessageButton messageId={message.id} />
                </div>
              </div>
              <p className="conversation-message__body">{message.body}</p>

              {messagePins.length > 0 ? (
                <ul className="coaching-pins">
                  {messagePins.map((pin) => {
                    const isResolved = pin.resolvedAt !== null;
                    const canMutate = canManagePins || pin.author.id === currentUserId;

                    return (
                      <li key={pin.id} className={`coaching-pin ${isResolved ? "coaching-pin--resolved" : ""}`}>
                        <div className="coaching-pin__head">
                          <span className="coaching-pin__author">{pin.author.name}</span>
                          <span className="coaching-pin__role">{roleLabels[pin.author.role]}</span>
                          <time className="coaching-pin__time" dateTime={pin.createdAt.toISOString()}>
                            {pin.createdAt.toLocaleDateString("ru-RU")}
                          </time>
                          {isResolved ? <span className="coaching-pin__status">Закрыта</span> : null}
                        </div>
                        <p className="coaching-pin__body">{pin.body}</p>
                        {canMutate ? (
                          <div className="coaching-pin__actions">
                            <form action={toggleCoachingPinResolved}>
                              <input type="hidden" name="pinId" value={pin.id} />
                              <button type="submit" className="action-button action-button--small">
                                {isResolved ? "Вернуть в работу" : "Отметить решённой"}
                              </button>
                            </form>
                            <form action={deleteCoachingPin}>
                              <input type="hidden" name="pinId" value={pin.id} />
                              <button type="submit" className="action-button action-button--small action-button--danger">
                                Удалить
                              </button>
                            </form>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {canCoach && conversationId ? (
                <CoachingPinComposer conversationId={conversationId} messageId={message.id} />
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
