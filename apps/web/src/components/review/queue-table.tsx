import { Inbox } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import type { ReviewQueueAssigneeDto, ReviewQueueConversationDto } from "@/lib/contracts/review-queue";
import {
  channelLabels,
  csatBucketLabels,
  appealStatusLabels,
  externalSourceLabel,
  formatMessageCount,
  qaStatusLabels,
  reanswerStatusLabels,
  samplingTypeLabels
} from "@/lib/labels";
import { bulkUpdateReviewQueue } from "@/lib/review-workflow-actions";
import { formatQualityScore } from "@/lib/score-display";
import { resolveReviewState, reviewStateLabels, type ReviewState } from "@/lib/review-state";
import { cn } from "@/lib/utils";

type QueueTableProps = {
  conversations: ReviewQueueConversationDto[];
  qaAssignees: ReviewQueueAssigneeDto[];
  returnTo: string;
};

/**
 * Status of the review state, mapped to the single colored chip on each row.
 * Color is rationed: only the highest-priority signal per row earns a hue, and
 * "finalized" stays neutral (done is not an alert), per the clean-product ramp.
 */
function reviewStateTone(state: ReviewState): ChipTone {
  if (state === "reopened") return "warning";
  if (state === "assigned" || state === "in_progress") return "accent";
  return "neutral";
}

function samplingIsSignal(samplingType: string) {
  return samplingType === "DSAT" || samplingType === "LEAD_SIGNAL" || samplingType === "LOW_SCORE";
}

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

export function QueueTable({ conversations, qaAssignees, returnTo }: QueueTableProps) {
  if (conversations.length === 0) {
    return (
      <Card className="queue-empty-state overflow-clip">
        <CardContent>
          <EmptyState
            icon={<Inbox size={26} aria-hidden="true" />}
            title="Очередь пуста"
            description="Новые диалоги появятся после импорта, API-загрузки или изменения фильтров отбора."
            action={
              <Button render={<Link href="/reviews" />} nativeButton={false}>
                Сбросить фильтры
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={bulkUpdateReviewQueue} className="queue-board overflow-clip">
      <input type="hidden" name="returnTo" value={returnTo} />

      <Card className="gap-0 overflow-clip py-0">
        <Collapsible className="queue-bulk-actions">
          <CollapsibleTrigger className="queue-bulk-actions__summary group flex w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-4 py-3 text-left">
            <span className="text-sm font-semibold text-foreground">Массовые действия</span>
            <span className="queue-filterbar__summary-action inline-flex items-center gap-2">
              <span className="queue-filterbar__summary-closed group-data-[panel-open]:hidden">Раскрыть</span>
              <span className="queue-filterbar__summary-open hidden group-data-[panel-open]:inline">Скрыть</span>
              <span className="queue-bulk-actions__count text-muted-foreground">{conversations.length}</span>
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent keepMounted className="queue-bulk-actions__body">
            <div className="flex flex-wrap items-end gap-3 border-t border-border bg-muted/30 px-4 py-3">
              <Field className="queue-bulk-actions__field min-w-[160px]">
                <FieldLabel htmlFor="bulk-qaStatus">Статус проверки</FieldLabel>
                <NativeSelect id="bulk-qaStatus" name="qaStatus" defaultValue="" className="w-full">
                  <NativeSelectOption value="">Не менять</NativeSelectOption>
                  {Object.entries(qaStatusLabels).map(([status, label]) => (
                    <NativeSelectOption key={status} value={status}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="queue-bulk-actions__field min-w-[160px]">
                <FieldLabel htmlFor="bulk-qaAssigneeId">Проверяющий</FieldLabel>
                <NativeSelect id="bulk-qaAssigneeId" name="qaAssigneeId" defaultValue="" className="w-full">
                  <NativeSelectOption value="">Не менять</NativeSelectOption>
                  {qaAssignees.map((assignee) => (
                    <NativeSelectOption key={assignee.id} value={assignee.id}>
                      {assignee.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="queue-bulk-actions__field min-w-[160px]">
                <FieldLabel htmlFor="bulk-reviewDueAt">Срок</FieldLabel>
                <Input id="bulk-reviewDueAt" name="reviewDueAt" type="date" />
              </Field>
              <ValidatedSubmitButton
                minCheckedNames={["conversationId"]}
                requireAnyValueNames={["qaStatus", "qaAssigneeId", "reviewDueAt"]}
                className={cn(buttonVariants(), "queue-bulk-actions__submit")}
              >
                Обновить
              </ValidatedSubmitButton>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        <Table className="queue-list">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">Выбор</span>
              </TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Оператор</span>
              </TableHead>
              <TableHead className="w-[140px]">Статус проверки</TableHead>
              <TableHead>Обращение</TableHead>
              <TableHead className="w-[140px]">Проверяющий</TableHead>
              <TableHead className="w-[100px]">Срок</TableHead>
              <TableHead className="w-[80px] text-right">Оценка</TableHead>
              <TableHead className="w-[96px]">
                <span className="sr-only">Действие</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conversations.map((conversation) => {
              const latestFinalizedReview =
                conversation.qaStatus === "FINALIZED"
                  ? conversation.reviews.find((review) => review.status === "FINALIZED" && review.reviewSource === "HUMAN")
                  : undefined;
              const draftReview = conversation.reviews.find((review) => review.status === "DRAFT" && review.reviewSource === "HUMAN");
              const reviewDueAt = conversation.reviewDueAt ? new Date(conversation.reviewDueAt) : null;
              const isOverdue =
                reviewDueAt !== null && reviewDueAt < new Date() && conversation.qaStatus !== "FINALIZED";
              const reviewState = resolveReviewState({
                qaStatus: conversation.qaStatus,
                hasDraftReview: Boolean(draftReview),
                hasFinalizedReview: Boolean(latestFinalizedReview)
              });
              const hasAppeal = latestFinalizedReview?.appealStatus && latestFinalizedReview.appealStatus !== "none";
              const hasReanswer = Boolean(latestFinalizedReview?.needsReanswer);
              const hasCritical = Boolean(latestFinalizedReview?.criticalError);
              const appealLabel = latestFinalizedReview
                ? appealStatusLabels[latestFinalizedReview.appealStatus] ?? latestFinalizedReview.appealStatus
                : "";
              const reanswerLabel = latestFinalizedReview
                ? reanswerStatusLabels[latestFinalizedReview.reanswerStatus] ?? "Переответ"
                : "Переответ";
              const dueLabel = reviewDueAt
                ? reviewDueAt.toLocaleDateString("ru-RU")
                : conversation.qaStatus === "FINALIZED"
                  ? "закрыто"
                  : "не задан";

              // One chip = one source of truth for review status (qa/review state).
              // Overdue, critical, reanswer, and appeal stay in meta / date column —
              // not as a second competing "status" chip.
              const statusChipTone: ChipTone = reviewStateTone(reviewState);
              const statusChipLabel = reviewStateLabels[reviewState];

              const signalItems = [
                hasCritical ? "критическая ошибка" : null,
                hasReanswer ? reanswerLabel : null,
                hasAppeal ? `апелляция: ${appealLabel}` : null,
                conversation.csatBucket === "NEGATIVE"
                  ? csatBucketLabels[conversation.csatBucket] ?? conversation.csatBucket
                  : null,
                samplingIsSignal(conversation.samplingType)
                  ? samplingTypeLabels[conversation.samplingType] ?? conversation.samplingType
                  : null,
                conversation.riskHint ? "риск" : null
              ].filter((signal): signal is string => Boolean(signal));

              return (
                <TableRow key={conversation.id} className="queue-row">
                  <TableCell>
                    <Checkbox
                      name="conversationId"
                      value={conversation.id}
                      aria-label={`Выбрать ${conversation.subject}`}
                      className="queue-row__checkbox"
                    />
                  </TableCell>

                  <TableCell>
                    <span
                      className="queue-row__avatar inline-flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
                      aria-hidden="true"
                    >
                      {initials(conversation.assigneeName ?? conversation.customerName)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <Chip tone={statusChipTone}>{statusChipLabel}</Chip>
                  </TableCell>

                  <TableCell className="max-w-[420px] whitespace-normal">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link
                        href={`/reviews/${conversation.id}`}
                        className="queue-row__title font-medium text-foreground hover:underline"
                      >
                        {conversation.subject}
                      </Link>
                      <span className="queue-row__reason text-xs text-muted-foreground">{conversation.priorityReason}</span>
                      <span className="queue-row__meta text-xs text-muted-foreground">
                        {conversation.customerName} · {conversation.assigneeName ?? "оператор не назначен"} ·{" "}
                        {channelLabels[conversation.channel]} · {formatMessageCount(conversation.messageCount)} ·{" "}
                        {externalSourceLabel(conversation.externalSource)}
                        {signalItems.length > 0 ? ` · ${signalItems.join(", ")}` : ""}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="whitespace-normal">
                    <span className="text-sm text-foreground">{conversation.qaAssigneeName ?? "Не назначен"}</span>
                  </TableCell>

                  <TableCell className={cn("whitespace-normal", isOverdue && "text-destructive")}>
                    <span className="text-sm font-medium tabular-nums">
                      {dueLabel}
                      {isOverdue ? <span className="sr-only"> — просрочено</span> : null}
                    </span>
                  </TableCell>

                  <TableCell className="text-right font-medium tabular-nums">
                    {formatQualityScore(latestFinalizedReview?.totalScore, draftReview ? "Черновик" : "—")}
                  </TableCell>

                  <TableCell>
                    <Button
                      render={<Link href={`/reviews/${conversation.id}`} />}
                      nativeButton={false}
                      variant="outline"
                      size="sm"
                      className="queue-row__open"
                    >
                      Открыть
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </form>
  );
}
