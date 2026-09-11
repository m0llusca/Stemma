import type { Message, RoleName } from "@prisma/client";
import { EvidenceMessageButton } from "@/components/review/evidence-message-button";
import { CoachingPinComposer } from "@/components/review/coaching-pin-composer";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Marker, MarkerContent } from "@/components/ui/marker";
import {
  Message as ChatMessage,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader
} from "@/components/ui/message";
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

function isAgentParty(participantType: Message["participantType"]) {
  return participantType === "HUMAN_AGENT" || participantType === "AI_AGENT";
}

function bubbleVariantFor(participantType: Message["participantType"]) {
  switch (participantType) {
    case "CUSTOMER":
      return "muted" as const;
    case "HUMAN_AGENT":
      return "tinted" as const;
    case "AI_AGENT":
      return "outline" as const;
    case "SYSTEM":
      return "ghost" as const;
    default: {
      const _exhaustive: never = participantType;
      return _exhaustive;
    }
  }
}

function renderPinList(
  messagePins: CoachingPinView[],
  canManagePins: boolean,
  currentUserId: string | undefined
) {
  if (messagePins.length === 0) {
    return null;
  }

  return (
    <ul className="mt-1 flex w-full flex-col gap-2">
      {messagePins.map((pin) => {
        const isResolved = pin.resolvedAt !== null;
        const canMutate = canManagePins || pin.author.id === currentUserId;

        return (
          <li
            key={pin.id}
            className={cn(
              "rounded-lg border border-border bg-muted/40 p-3",
              isResolved && "opacity-80"
            )}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 break-words font-medium text-foreground">
                {pin.author.name}
              </span>
              <span>{roleLabels[pin.author.role]}</span>
              <time dateTime={pin.createdAt.toISOString()}>
                {pin.createdAt.toLocaleDateString("ru-RU")}
              </time>
              {isResolved ? <Badge variant="secondary">Закрыта</Badge> : null}
            </div>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground">
              {pin.body}
            </p>
            {canMutate ? (
              <div className="mt-2 flex flex-wrap gap-2">
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
  );
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
    <Card className="overflow-clip py-0" data-slot="conversation-chat-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border bg-muted/30 px-4 py-3">
        <CardTitle className="text-base">Таймлайн диалога</CardTitle>
        <Badge variant="secondary" className="font-normal tabular-nums">
          {formatMessageCount(messages.length)}
        </Badge>
      </CardHeader>
      <CardContent className="bg-muted/15 px-3 py-5 sm:px-5">
        <MessageGroup
          className="gap-5"
          data-slot="conversation-chat"
          role="log"
          aria-label="Сообщения диалога"
        >
          {messages.map((message) => {
            const isHighlighted = highlightedMessages.has(message.id);
            const messagePins = pinsByMessage.get(message.id) ?? [];
            const isAgent = isAgentParty(message.participantType);
            const isAiAuthored = message.participantType === "AI_AGENT";
            const isSystem = message.participantType === "SYSTEM";
            const align = isAgent ? "end" : "start";
            const flashClass = cn(
              "scroll-mt-20",
              "data-[evidence-flash]:rounded-lg data-[evidence-flash]:bg-primary/10 data-[evidence-flash]:ring-2 data-[evidence-flash]:ring-primary/40",
              "motion-safe:data-[evidence-flash]:animate-pulse motion-reduce:data-[evidence-flash]:animate-none motion-reduce:data-[evidence-flash]:bg-primary/15"
            );

            if (isSystem) {
              return (
                <article
                  key={message.id}
                  id={`msg-${message.id}`}
                  data-slot="conversation-message"
                  data-party={message.participantType}
                  data-align="center"
                  data-lane="system"
                  className={cn(
                    flashClass,
                    isHighlighted && "rounded-lg bg-primary/5 ring-1 ring-primary/20"
                  )}
                >
                  <Marker variant="separator" className="py-1">
                    <MarkerContent className="max-w-[min(100%,36rem)] text-center text-xs">
                      <span
                        data-slot="conversation-message-avatar"
                        className="sr-only"
                        aria-hidden="true"
                      >
                        {initials(message.authorName)}
                      </span>
                      <span data-slot="conversation-message-content" className="inline-flex max-w-full flex-col items-center gap-1">
                        <span
                          data-slot="conversation-message-header"
                          className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
                        >
                          <span className="font-medium text-foreground">{message.authorName}</span>
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                            {participantLabels[message.participantType]}
                          </span>
                        </span>
                        <span
                          data-slot="conversation-message-surface"
                          data-variant="plain"
                          className="whitespace-pre-wrap break-words text-muted-foreground"
                        >
                          {message.body}
                        </span>
                      </span>
                    </MarkerContent>
                  </Marker>
                  <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                    <time
                      className="whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums"
                      dateTime={message.sentAt.toISOString()}
                    >
                      {formatTimestamp(message.sentAt)}
                    </time>
                    <EvidenceMessageButton messageId={message.id} />
                  </div>
                  {renderPinList(messagePins, canManagePins, currentUserId)}
                  {canCoach && conversationId ? (
                    <div className="mt-2 flex justify-center">
                      <CoachingPinComposer conversationId={conversationId} messageId={message.id} />
                    </div>
                  ) : null}
                </article>
              );
            }

            return (
              <ChatMessage
                key={message.id}
                id={`msg-${message.id}`}
                data-slot="conversation-message"
                data-party={message.participantType}
                data-lane={isAgent ? "agent" : "customer"}
                align={align}
                className={cn(
                  flashClass,
                  isAgent ? "pl-8 sm:pl-16" : "pr-8 sm:pr-16",
                  isHighlighted && "rounded-lg bg-primary/5 p-2 ring-1 ring-primary/20"
                )}
              >
                <MessageAvatar
                  data-slot="conversation-message-avatar"
                  className={cn(
                    "size-8 border text-xs font-semibold group-has-data-[slot=message-footer]/message:translate-y-0",
                    "group-data-[party=CUSTOMER]/message:border-border group-data-[party=CUSTOMER]/message:bg-muted group-data-[party=CUSTOMER]/message:text-muted-foreground",
                    "group-data-[party=HUMAN_AGENT]/message:border-primary/30 group-data-[party=HUMAN_AGENT]/message:bg-primary/10 group-data-[party=HUMAN_AGENT]/message:text-primary",
                    "group-data-[party=AI_AGENT]/message:border-(--ai-border) group-data-[party=AI_AGENT]/message:bg-(--ai-soft) group-data-[party=AI_AGENT]/message:text-(--ai-ink)"
                  )}
                  aria-hidden="true"
                >
                  {initials(message.authorName)}
                </MessageAvatar>

                <MessageContent
                  data-slot="conversation-message-content"
                  className="max-w-[min(100%,36rem)] gap-1.5"
                >
                  <MessageHeader
                    data-slot="conversation-message-header"
                    className={cn(
                      "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm",
                      isAgent && "justify-end text-right"
                    )}
                  >
                    <span className="min-w-0 break-words font-semibold text-foreground">
                      {message.authorName}
                    </span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
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
                  </MessageHeader>

                  <Bubble
                    variant={bubbleVariantFor(message.participantType)}
                    align={align}
                    className={cn(
                      "max-w-full",
                      isAiAuthored &&
                        "*:data-[slot=bubble-content]:border-(--ai-border) *:data-[slot=bubble-content]:bg-(--ai-soft)"
                    )}
                  >
                    <BubbleContent
                      data-slot="conversation-message-surface"
                      data-variant="bubble"
                      className="max-w-prose space-y-2 shadow-xs"
                    >
                      {isAiAuthored ? (
                        <p className="flex min-w-0 flex-wrap items-baseline gap-1.5 break-words text-xs text-muted-foreground">
                          <Chip tone="ai">ИИ</Chip>
                          Ответ подготовлен с подсказкой ИИ — проверьте формулировку перед зачётом.
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {message.body}
                      </p>
                    </BubbleContent>
                  </Bubble>

                  <MessageFooter
                    className={cn(
                      "flex flex-wrap items-center gap-2 px-1",
                      isAgent ? "justify-end" : "justify-start"
                    )}
                  >
                    <time
                      className="whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums"
                      dateTime={message.sentAt.toISOString()}
                    >
                      {formatTimestamp(message.sentAt)}
                    </time>
                    <EvidenceMessageButton messageId={message.id} />
                  </MessageFooter>

                  {renderPinList(messagePins, canManagePins, currentUserId)}

                  {canCoach && conversationId ? (
                    <div className="mt-1 w-full">
                      <CoachingPinComposer conversationId={conversationId} messageId={message.id} />
                    </div>
                  ) : null}
                </MessageContent>
              </ChatMessage>
            );
          })}
        </MessageGroup>
      </CardContent>
    </Card>
  );
}
