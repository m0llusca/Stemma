import { Inbox } from "lucide-react";
import Link from "next/link";
import { ReviewStatusChip } from "@/components/review/review-status-chip";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
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
import {
  QUEUE_EMPTY_RESET_FILTERS_LABEL,
  queueTableEmptyCopy
} from "@/lib/review/queue-empty-copy";
import { filtersFromReviewsHref } from "@/lib/review/queue-href-filters";
import { bulkUpdateReviewQueue } from "@/lib/review-workflow-actions";
import { CONFIRM_REOPEN_WORKFLOW_ACTION } from "@/lib/review-workflow-policy";
import { formatQualityScore } from "@/lib/score-display";
import { cn } from "@/lib/utils";

type QueueTableProps = {
  conversations: ReviewQueueConversationDto[];
  qaAssignees: ReviewQueueAssigneeDto[];
  returnTo: string;
};

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
    const hasActiveFilters = Boolean(filtersFromReviewsHref(returnTo));
    const emptyCopy = queueTableEmptyCopy(hasActiveFilters);

    return (
      <Card className="overflow-clip">
        <CardContent>
          <EmptyState
            icon={<Inbox size={26} aria-hidden="true" />}
            title={emptyCopy.title}
            description={emptyCopy.description}
            action={
              hasActiveFilters ? (
                <Button render={<Link href="/reviews" />} nativeButton={false}>
                  {QUEUE_EMPTY_RESET_FILTERS_LABEL}
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={bulkUpdateReviewQueue} className="overflow-clip">
      <input type="hidden" name="returnTo" value={returnTo} />

      <Card className="gap-0 overflow-clip py-0">
        <Collapsible>
          <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-4 py-3 text-left">
            <span className="text-sm font-semibold text-foreground">Массовые действия</span>
            <span className="inline-flex items-center gap-2">
              <span className="group-data-[panel-open]:hidden">Раскрыть</span>
              <span className="hidden group-data-[panel-open]:inline">Скрыть</span>
              <span className="text-muted-foreground">{conversations.length}</span>
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent keepMounted>
            <div className="flex flex-wrap items-end gap-3 border-t border-border bg-muted/30 px-4 py-3">
              <Field className="min-w-[160px]">
                <FieldLabel htmlFor="bulk-qaStatus">Статус проверки</FieldLabel>
                <NativeSelect id="bulk-qaStatus" name="qaStatus" defaultValue="" className="w-full">
                  <NativeSelectOption value="">Не менять</NativeSelectOption>
                  {Object.entries(qaStatusLabels).map(([status, label]) => (
                    <NativeSelectOption key={status} value={status}>
                      {status === "REOPENED" ? `${label} (запросить)` : label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="min-w-[200px]">
                <FieldLabel htmlFor="bulk-workflowAction">Действие с переоткрытием</FieldLabel>
                <NativeSelect id="bulk-workflowAction" name="workflowAction" defaultValue="" className="w-full">
                  <NativeSelectOption value="">Обычное обновление / запрос</NativeSelectOption>
                  <NativeSelectOption value={CONFIRM_REOPEN_WORKFLOW_ACTION}>
                    Подтвердить переоткрытие (второй сотрудник)
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field className="min-w-[160px]">
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
              <Field className="min-w-[160px]">
                <FieldLabel htmlFor="bulk-reviewDueAt">Срок</FieldLabel>
                <Input id="bulk-reviewDueAt" name="reviewDueAt" type="date" />
              </Field>
              <Field className="min-w-[220px] flex-1">
                <FieldLabel htmlFor="bulk-reopen-reason">Причина переоткрытия</FieldLabel>
                <Textarea
                  id="bulk-reopen-reason"
                  name="reason"
                  rows={1}
                  placeholder="Обязательно для запроса FINALIZED → переоткрытие"
                />
              </Field>
              <ValidatedSubmitButton
                minCheckedNames={["conversationId"]}
                requireAnyValueNames={["qaStatus", "qaAssigneeId", "reviewDueAt", "workflowAction"]}
                className={buttonVariants()}
              >
                Обновить
              </ValidatedSubmitButton>
            </div>
            <p className="border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
              Завершенные проверки: статус «На пересмотре» создаёт запрос. Подтверждение — отдельным действием другого
              сотрудника.
            </p>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        <Table>
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
                conversation.riskHint ? "риск" : null,
                conversation.pendingReopen
                  ? `запрос переоткрытия: ${conversation.pendingReopen.requestedByName ?? "сотрудник"}`
                  : null
              ].filter((signal): signal is string => Boolean(signal));

              return (
                <TableRow key={conversation.id}>
                  <TableCell>
                    <Checkbox
                      name="conversationId"
                      value={conversation.id}
                      aria-label={`Выбрать ${conversation.subject}`}
                    />
                  </TableCell>

                  <TableCell>
                    <span
                      className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
                      aria-hidden="true"
                    >
                      {initials(conversation.assigneeName ?? conversation.customerName)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <ReviewStatusChip conversation={conversation} />
                  </TableCell>

                  <TableCell className="max-w-[420px] whitespace-normal">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link
                        href={`/reviews/${conversation.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {conversation.subject}
                      </Link>
                      <span className="text-xs text-muted-foreground">{conversation.priorityReason}</span>
                      <span className="text-xs text-muted-foreground">
                        {conversation.customerName} · {conversation.assigneeName ?? "оператор не назначен"} ·{" "}
                        {channelLabels[conversation.channel]} · {formatMessageCount(conversation.messageCount)} ·{" "}
                        {externalSourceLabel(conversation.externalSource)}
                        {signalItems.length > 0 ? ` · ${signalItems.join(", ")}` : ""}
                      </span>
                      {conversation.pendingReopen ? (
                        <span className="text-xs text-amber-700 dark:text-amber-400">
                          Причина запроса: {conversation.pendingReopen.reason}
                        </span>
                      ) : null}
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
