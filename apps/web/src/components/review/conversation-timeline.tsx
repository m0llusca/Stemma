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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "—";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toLocaleUpperCase("ru-RU");
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toLocaleUpperCase("ru-RU");
}

function formatTimestamp(value: Date) {
  return value.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

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
    <section className="review-conversation-panel panel overflow-clip">
      <div className="review-conversation-panel__header">
        <h2>Таймлайн диалога</h2>
        <span className="review-conversation-panel__count">{formatMessageCount(messages.length)}</span>
      </div>
      <div className="review-conversation-panel__body">
        {messages.map((message) => {
          const isHighlighted = highlightedMessages.has(message.id);
          const messagePins = pinsByMessage.get(message.id) ?? [];
          const isAgent = message.participantType === "HUMAN_AGENT" || message.participantType === "AI_AGENT";
          const isAiAuthored = message.participantType === "AI_AGENT";

          return (
            <article
              key={message.id}
              data-party={message.participantType}
              className={`conversation-message ${isAgent ? "conversation-message--agent" : ""} ${isHighlighted ? "conversation-message--selected" : ""}`}
            >
              <span className="conversation-message__avatar" aria-hidden="true">
                {initials(message.authorName)}
              </span>
              <div className="conversation-message__content">
                <div className="conversation-message__header">
                  <span className="conversation-message__author">{message.authorName}</span>
                  <span className="conversation-message__role">
                    {participantLabels[message.participantType]}
                  </span>
                  {isAiAuthored ? (
                    <span className="conversation-message__ai-tag">ИИ</span>
                  ) : null}
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
                    <time className="conversation-message__time" dateTime={message.sentAt.toISOString()}>
                      {formatTimestamp(message.sentAt)}
                    </time>
                    <EvidenceMessageButton messageId={message.id} />
                  </div>
                </div>

                <div className={isAgent ? "conversation-message__bubble" : "conversation-message__plain"}>
                  {isAiAuthored ? (
                    <p className="conversation-message__ai-rationale">
                      <span className="conversation-message__ai-rationale-tag">ИИ</span>
                      Ответ подготовлен с подсказкой ИИ — проверьте формулировку перед зачётом.
                    </p>
                  ) : null}
                  <p className="conversation-message__body">{message.body}</p>
                </div>

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
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
