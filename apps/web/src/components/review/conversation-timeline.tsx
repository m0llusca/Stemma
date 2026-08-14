import type { Message, RoleName } from "@prisma/client";
import { Fragment } from "react";
import { EvidenceMessageButton } from "@/components/review/evidence-message-button";
import { CoachingPinComposer } from "@/components/review/coaching-pin-composer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Separator } from "@/components/ui/separator";
import { deleteCoachingPin, toggleCoachingPinResolved } from "@/lib/coaching-pin-actions";
import { formatMessageCount, participantLabels, roleLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

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
    <Card className="review-conversation-panel overflow-clip py-0">
      <CardHeader className="review-conversation-panel__header flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border bg-muted/30 px-4 py-3">
        <CardTitle className="text-base">Таймлайн диалога</CardTitle>
        <Badge variant="secondary" className="font-normal tabular-nums">
          {formatMessageCount(messages.length)}
        </Badge>
      </CardHeader>
      <CardContent className="review-conversation-panel__body space-y-0 px-5 py-2">
        {messages.map((message, index) => {
          const isHighlighted = highlightedMessages.has(message.id);
          const messagePins = pinsByMessage.get(message.id) ?? [];
          const isAgent = message.participantType === "HUMAN_AGENT" || message.participantType === "AI_AGENT";
          const isAiAuthored = message.participantType === "AI_AGENT";

          return (
            <Fragment key={message.id}>
              {index > 0 ? <Separator className="opacity-60" /> : null}
              <article
                id={`msg-${message.id}`}
                data-slot="conversation-message"
                data-party={message.participantType}
                className={cn(
                  "group/message conversation-message grid min-w-0 scroll-mt-20 grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 py-4",
                  "[&.conversation-message--evidence-flash]:rounded-lg [&.conversation-message--evidence-flash]:bg-primary/10 [&.conversation-message--evidence-flash]:ring-2 [&.conversation-message--evidence-flash]:ring-primary/40",
                  "motion-safe:[&.conversation-message--evidence-flash]:animate-pulse motion-reduce:[&.conversation-message--evidence-flash]:animate-none motion-reduce:[&.conversation-message--evidence-flash]:bg-primary/15",
                  isAgent && "conversation-message--agent",
                  isHighlighted &&
                    "conversation-message--selected -mx-3 rounded-lg bg-primary/5 px-3 ring-1 ring-primary/20"
                )}
              >
                <span
                  data-slot="conversation-message-avatar"
                  className={cn(
                    "conversation-message__avatar inline-flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    "group-data-[party=CUSTOMER]/message:border-border group-data-[party=CUSTOMER]/message:bg-muted group-data-[party=CUSTOMER]/message:text-muted-foreground",
                    "group-data-[party=HUMAN_AGENT]/message:border-primary/30 group-data-[party=HUMAN_AGENT]/message:bg-primary/10 group-data-[party=HUMAN_AGENT]/message:text-primary",
                    "group-data-[party=AI_AGENT]/message:border-(--ai-border) group-data-[party=AI_AGENT]/message:bg-(--ai-soft) group-data-[party=AI_AGENT]/message:text-(--ai-ink)",
                    "group-data-[party=SYSTEM]/message:border-border group-data-[party=SYSTEM]/message:bg-muted/60 group-data-[party=SYSTEM]/message:text-muted-foreground"
                  )}
                  aria-hidden="true"
                >
                  {initials(message.authorName)}
                </span>
                <div
                  data-slot="conversation-message-content"
                  className="conversation-message__content min-w-0 space-y-2"
                >
                  <div className="conversation-message__header flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="conversation-message__author min-w-0 break-words font-semibold">
                      {message.authorName}
                    </span>
                    <span className="conversation-message__role rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {participantLabels[message.participantType]}
                    </span>
                    {isAiAuthored ? <Chip tone="ai">ИИ</Chip> : null}
                    {isHighlighted ? (
                      <Badge variant="outline" className="border-transparent bg-primary/15 text-primary">
                        Доказательство
                      </Badge>
                    ) : null}
                    {messagePins.length > 0 ? (
                      <Badge variant="secondary">
                        {messagePins.length === 1 ? "1 заметка" : `${messagePins.length} заметок`}
                      </Badge>
                    ) : null}
                    {message.isPrivate ? <Badge variant="outline">Приватно</Badge> : null}
                    <div className="message-toolbar ml-auto flex flex-wrap items-center gap-2">
                      <time
                        className="conversation-message__time whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums"
                        dateTime={message.sentAt.toISOString()}
                      >
                        {formatTimestamp(message.sentAt)}
                      </time>
                      <EvidenceMessageButton messageId={message.id} />
                    </div>
                  </div>

                  <div
                    className={cn(
                      "min-w-0 space-y-2",
                      isAgent &&
                        "conversation-message__bubble max-w-prose rounded-lg border p-3 group-data-[party=HUMAN_AGENT]/message:border-border group-data-[party=HUMAN_AGENT]/message:bg-card group-data-[party=AI_AGENT]/message:border-(--ai-border) group-data-[party=AI_AGENT]/message:bg-(--ai-soft)",
                      !isAgent && "conversation-message__plain"
                    )}
                  >
                    {isAiAuthored ? (
                      <p className="conversation-message__ai-rationale flex min-w-0 flex-wrap items-baseline gap-1.5 break-words text-xs text-muted-foreground">
                        <Chip tone="ai">ИИ</Chip>
                        Ответ подготовлен с подсказкой ИИ — проверьте формулировку перед зачётом.
                      </p>
                    ) : null}
                    <p className="conversation-message__body max-w-prose whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                      {message.body}
                    </p>
                  </div>

                  {messagePins.length > 0 ? (
                    <ul className="coaching-pins mt-2 flex flex-col gap-2">
                      {messagePins.map((pin) => {
                        const isResolved = pin.resolvedAt !== null;
                        const canMutate = canManagePins || pin.author.id === currentUserId;

                        return (
                          <li
                            key={pin.id}
                            className={cn(
                              "coaching-pin rounded-lg border border-border bg-muted/40 p-3",
                              isResolved && "coaching-pin--resolved opacity-80"
                            )}
                          >
                            <div className="coaching-pin__head flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="coaching-pin__author min-w-0 break-words font-medium text-foreground">
                                {pin.author.name}
                              </span>
                              <span className="coaching-pin__role">{roleLabels[pin.author.role]}</span>
                              <time className="coaching-pin__time" dateTime={pin.createdAt.toISOString()}>
                                {pin.createdAt.toLocaleDateString("ru-RU")}
                              </time>
                              {isResolved ? (
                                <Badge variant="secondary" className="coaching-pin__status">
                                  Закрыта
                                </Badge>
                              ) : null}
                            </div>
                            <p className="coaching-pin__body mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground">
                              {pin.body}
                            </p>
                            {canMutate ? (
                              <div className="coaching-pin__actions mt-2 flex flex-wrap gap-2">
                                <form action={toggleCoachingPinResolved}>
                                  <input type="hidden" name="pinId" value={pin.id} />
                                  <Button type="submit" size="xs" variant="outline">
                                    {isResolved ? "Вернуть в работу" : "Отметить решённой"}
                                  </Button>
                                </form>
                                <form action={deleteCoachingPin}>
                                  <input type="hidden" name="pinId" value={pin.id} />
                                  <Button type="submit" size="xs" variant="destructive">
                                    Удалить
                                  </Button>
                                </form>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}

                  {canCoach && conversationId ? (
                    <div className="mt-2">
                      <CoachingPinComposer conversationId={conversationId} messageId={message.id} />
                    </div>
                  ) : null}
                </div>
              </article>
            </Fragment>
          );
        })}
      </CardContent>
    </Card>
  );
}
