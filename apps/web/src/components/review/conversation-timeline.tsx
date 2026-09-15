import type { Message, RoleName } from "@prisma/client";
import { Lock, StickyNote } from "lucide-react";
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
  MessageContent,
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
  const parts = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${read("day")}.${read("month")}, ${read("hour")}:${read("minute")}`;
}

function isAgentParty(participantType: Message["participantType"]) {
  return participantType === "HUMAN_AGENT" || participantType === "AI_AGENT";
}

/** Evidence is only for real dialogue turns (client / operator / ИИ), not SYSTEM or notes. */
function canAttachEvidence(
  participantType: Message["participantType"],
  isPrivate: boolean
) {
  if (isPrivate) {
    return false;
  }

  switch (participantType) {
    case "CUSTOMER":
    case "HUMAN_AGENT":
    case "AI_AGENT":
      return true;
    case "SYSTEM":
      return false;
    default: {
      const _exhaustive: never = participantType;
      return _exhaustive;
    }
  }
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

function avatarToneClass(participantType: Message["participantType"]) {
  switch (participantType) {
    case "CUSTOMER":
      return "border-border bg-muted text-muted-foreground";
    case "HUMAN_AGENT":
      return "border-primary/30 bg-primary/10 text-primary";
    case "AI_AGENT":
      return "border-(--ai-border) bg-(--ai-soft) text-(--ai-ink)";
    case "SYSTEM":
      return "border-border bg-muted text-muted-foreground";
    default: {
      const _exhaustive: never = participantType;
      return _exhaustive;
    }
  }
}

function flashClassName(isHighlighted: boolean) {
  return cn(
    "scroll-mt-20",
    "data-[evidence-flash]:rounded-lg data-[evidence-flash]:bg-primary/10 data-[evidence-flash]:ring-2 data-[evidence-flash]:ring-primary/40",
    "motion-safe:data-[evidence-flash]:animate-pulse motion-reduce:data-[evidence-flash]:animate-none motion-reduce:data-[evidence-flash]:bg-primary/15",
    isHighlighted && "rounded-lg bg-primary/5 ring-1 ring-primary/20"
  );
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
    <ul className="mt-2 flex w-full flex-col gap-2">
      {messagePins.map((pin) => {
        const isResolved = pin.resolvedAt !== null;
        const canMutate = canManagePins || pin.author.id === currentUserId;

        return (
          <li
            key={pin.id}
            data-slot="conversation-coaching-pin"
            className={cn(
              "rounded-lg border border-dashed border-amber-500/35 bg-amber-500/8 p-3",
              isResolved && "opacity-80"
            )}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StickyNote className="size-3.5 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden="true" />
              <Chip tone="warning" size="xs">
                Коучинг
              </Chip>
              <span className="min-w-0 break-words font-medium text-foreground">
                {pin.author.name}
              </span>
              <span>{roleLabels[pin.author.role]}</span>
              <time dateTime={pin.createdAt.toISOString()}>
                {formatTimestamp(pin.createdAt)}
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

function TimelineMeta({
  sentAt,
  showEvidence,
  messageId,
  align
}: {
  sentAt: Date;
  showEvidence: boolean;
  messageId: string;
  align: "start" | "end" | "center";
}) {
  return (
    <div
      data-slot="conversation-message-meta"
      className={cn(
        "flex flex-wrap items-center gap-2 px-1",
        align === "end" && "justify-end",
        align === "center" && "justify-center",
        align === "start" && "justify-start"
      )}
    >
      <time
        className="whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums"
        dateTime={sentAt.toISOString()}
      >
        {formatTimestamp(sentAt)}
      </time>
      {showEvidence ? <EvidenceMessageButton messageId={messageId} /> : null}
    </div>
  );
}

function ChatAvatar({
  name,
  participantType
}: {
  name: string;
  participantType: Message["participantType"];
}) {
  return (
    <div
      data-slot="conversation-message-avatar"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center self-end overflow-hidden rounded-full border text-xs font-semibold",
        avatarToneClass(participantType)
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}

function HiddenAvatar({ name }: { name: string }) {
  return (
    <span data-slot="conversation-message-avatar" className="sr-only" aria-hidden="true">
      {initials(name)}
    </span>
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
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border px-4 py-3">
        <CardTitle className="text-base">Таймлайн диалога</CardTitle>
        <Badge variant="secondary" className="font-normal tabular-nums">
          {formatMessageCount(messages.length)}
        </Badge>
      </CardHeader>
      <CardContent className="px-3 py-5 sm:px-5">
        <MessageGroup
          className="gap-6"
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
            const isInternalNote = message.isPrivate;
            const align = isAgent ? "end" : "start";
            const coachComposer =
              canCoach && conversationId ? (
                <div className={cn("mt-2", isInternalNote || isSystem ? "flex justify-center" : "w-full")}>
                  <CoachingPinComposer conversationId={conversationId} messageId={message.id} />
                </div>
              ) : null;

            if (isInternalNote) {
              return (
                <article
                  key={message.id}
                  id={`msg-${message.id}`}
                  data-slot="conversation-message"
                  data-party={message.participantType}
                  data-align="center"
                  data-lane="private"
                  className={flashClassName(isHighlighted)}
                >
                  <div
                    data-slot="conversation-message-content"
                    className="mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/8 px-4 py-3"
                  >
                    <MessageHeader
                      data-slot="conversation-message-header"
                      className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 px-0 text-sm"
                    >
                      <Lock className="size-3.5 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden="true" />
                      <Chip tone="warning" size="xs">
                        Внутренняя заметка
                      </Chip>
                      <span className="min-w-0 break-words font-semibold text-foreground">
                        {message.authorName}
                      </span>
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
                    </MessageHeader>
                    <HiddenAvatar name={message.authorName} />
                    <p
                      data-slot="conversation-message-surface"
                      data-variant="plain"
                      className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground"
                    >
                      {message.body}
                    </p>
                    <TimelineMeta
                      sentAt={message.sentAt}
                      showEvidence={false}
                      messageId={message.id}
                      align="center"
                    />
                    {renderPinList(messagePins, canManagePins, currentUserId)}
                    {coachComposer}
                  </div>
                </article>
              );
            }

            if (isSystem) {
              return (
                <article
                  key={message.id}
                  id={`msg-${message.id}`}
                  data-slot="conversation-message"
                  data-party={message.participantType}
                  data-align="center"
                  data-lane="system"
                  className={flashClassName(isHighlighted)}
                >
                  <Marker variant="separator" className="py-1">
                    <MarkerContent className="max-w-[min(100%,36rem)] text-center text-xs">
                      <HiddenAvatar name={message.authorName} />
                      <span
                        data-slot="conversation-message-content"
                        className="inline-flex max-w-full flex-col items-center gap-1"
                      >
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
                  <TimelineMeta
                    sentAt={message.sentAt}
                    showEvidence={false}
                    messageId={message.id}
                    align="center"
                  />
                  {renderPinList(messagePins, canManagePins, currentUserId)}
                  {coachComposer}
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
                  flashClassName(isHighlighted),
                  "flex-col gap-1.5 data-[align=end]:flex-col data-[align=start]:flex-col",
                  isAgent ? "items-end" : "items-start",
                  isHighlighted && "p-2"
                )}
              >
                <MessageContent
                  data-slot="conversation-message-content"
                  className={cn(
                    "max-w-[min(100%,36rem)] gap-1.5",
                    isAgent ? "items-end" : "items-start"
                  )}
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
                  </MessageHeader>

                  <div
                    data-slot="conversation-message-row"
                    className={cn("flex items-end gap-2", isAgent && "flex-row-reverse")}
                  >
                    <ChatAvatar
                      name={message.authorName}
                      participantType={message.participantType}
                    />

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
                  </div>

                  <div className={cn("w-full", isAgent ? "pr-10" : "pl-10")}>
                    <TimelineMeta
                      sentAt={message.sentAt}
                      showEvidence={canAttachEvidence(
                        message.participantType,
                        message.isPrivate
                      )}
                      messageId={message.id}
                      align={align}
                    />
                  </div>

                  {renderPinList(messagePins, canManagePins, currentUserId)}
                  {coachComposer}
                </MessageContent>
              </ChatMessage>
            );
          })}
        </MessageGroup>
      </CardContent>
    </Card>
  );
}
