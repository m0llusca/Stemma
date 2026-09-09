import type { Conversation, RoleName, User } from "@prisma/client";
import { ActionFlowGuard } from "@/components/action-flow-guard";
import { DisclosureMorphChevron } from "@/components/ui/disclosure-morph-chevron";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { qaStatusLabels, roleLabels } from "@/lib/labels";
import { updateConversationWorkflow } from "@/lib/review-workflow-actions";
import { CONFIRM_REOPEN_WORKFLOW_ACTION } from "@/lib/review-workflow-policy";

type WorkflowConversation = Pick<Conversation, "id" | "qaStatus" | "qaAssigneeId" | "qaAssigneeName" | "reviewDueAt">;

type WorkflowAssignee = Pick<User, "id" | "name"> & {
  role: RoleName;
};

type PendingReopenRequest = {
  reason: string;
  requestedById: string;
  requestedByName: string | null;
  requestedAt: Date;
};

type WorkflowManagementPanelProps = {
  conversation: WorkflowConversation;
  assignees: WorkflowAssignee[];
  currentUserId: string;
  pendingReopen: PendingReopenRequest | null;
};

const qaStatuses = ["QUEUED", "ASSIGNED", "IN_PROGRESS", "FINALIZED", "REOPENED"] as const;

function toDateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function WorkflowManagementPanel({
  conversation,
  assignees,
  currentUserId,
  pendingReopen
}: WorkflowManagementPanelProps) {
  const hasUnknownAssignee =
    conversation.qaAssigneeId !== null && !assignees.some((assignee) => assignee.id === conversation.qaAssigneeId);
  const isFinalized = conversation.qaStatus === "FINALIZED";
  const canConfirmReopen =
    isFinalized && pendingReopen !== null && pendingReopen.requestedById !== currentUserId;
  const isOwnPendingRequest =
    isFinalized && pendingReopen !== null && pendingReopen.requestedById === currentUserId;

  return (
    <Collapsible className="group overflow-clip rounded-xl bg-card ring-1 ring-foreground/10">
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Управление проверкой</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {qaStatusLabels[conversation.qaStatus]} · {conversation.qaAssigneeName ?? "Проверяющий не назначен"} ·{" "}
            {conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "без срока"}
            {pendingReopen ? " · ожидает подтверждения переоткрытия" : ""}
          </p>
        </div>
        <span
          className="disclosure-chevron flex size-8 shrink-0 items-center justify-center rounded-md text-primary"
          aria-hidden="true"
        >
          <DisclosureMorphChevron />
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <Card className="rounded-none border-0 ring-0">
          <CardHeader className="border-t border-border py-0 sr-only">
            <CardTitle>Параметры проверки</CardTitle>
            <CardDescription>Статус проверки, исполнитель и срок</CardDescription>
          </CardHeader>
          <CardContent className="border-t border-border pt-4">
            {pendingReopen ? (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-sm">
                <p className="font-medium text-foreground">Запрос на переоткрытие ожидает подтверждения</p>
                <p className="mt-1 text-muted-foreground">
                  Запросил: {pendingReopen.requestedByName ?? "сотрудник"} ·{" "}
                  {pendingReopen.requestedAt.toLocaleString("ru-RU")}
                </p>
                <p className="mt-2 text-foreground">
                  <span className="text-muted-foreground">Причина: </span>
                  {pendingReopen.reason}
                </p>
                {isOwnPendingRequest ? (
                  <p className="mt-2 text-muted-foreground">
                    Подтвердить должен другой сотрудник с правом управления маршрутом.
                  </p>
                ) : null}
              </div>
            ) : null}

            {isFinalized && !pendingReopen ? (
              <p className="mb-4 text-sm text-muted-foreground">
                Переоткрытие завершенной проверки — в два шага: сначала запрос с причиной, затем подтверждение
                другим сотрудником.
              </p>
            ) : null}

            <form
              action={updateConversationWorkflow}
              className="grid gap-3 md:grid-cols-[minmax(170px,200px)_minmax(180px,1fr)_minmax(150px,180px)_auto] md:items-end"
            >
              {/* Forces a full-document commit of the action's redirect when
                  the client router drops it (Next 16.2.x). */}
              <ActionFlowGuard />
              <input type="hidden" name="conversationId" value={conversation.id} />

              <Field>
                <FieldLabel htmlFor="workflow-qa-status">Статус проверки</FieldLabel>
                <NativeSelect
                  id="workflow-qa-status"
                  name="qaStatus"
                  defaultValue={conversation.qaStatus}
                  className="w-full"
                >
                  {qaStatuses.map((status) => (
                    <NativeSelectOption key={status} value={status}>
                      {status === "REOPENED" && isFinalized
                        ? "На пересмотре (запросить)"
                        : qaStatusLabels[status]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel htmlFor="workflow-qa-assignee">Проверяющий</FieldLabel>
                <NativeSelect
                  id="workflow-qa-assignee"
                  name="qaAssigneeId"
                  defaultValue={conversation.qaAssigneeId ?? ""}
                  className="w-full"
                >
                  <NativeSelectOption value="">Не назначен</NativeSelectOption>
                  {hasUnknownAssignee ? (
                    <NativeSelectOption value={conversation.qaAssigneeId ?? ""}>
                      {conversation.qaAssigneeName ?? "Текущий исполнитель"}
                    </NativeSelectOption>
                  ) : null}
                  {assignees.map((assignee) => (
                    <NativeSelectOption key={assignee.id} value={assignee.id}>
                      {assignee.name} · {roleLabels[assignee.role]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel htmlFor="workflow-review-due-at">Срок</FieldLabel>
                <Input
                  id="workflow-review-due-at"
                  name="reviewDueAt"
                  type="date"
                  defaultValue={toDateInputValue(conversation.reviewDueAt)}
                />
              </Field>

              <div className="flex items-end">
                <Button type="submit" className="w-full md:w-auto">
                  {isFinalized && !pendingReopen ? "Запросить / обновить" : "Обновить"}
                </Button>
              </div>

              <Field className="md:col-span-4">
                <FieldLabel htmlFor="workflow-reopen-reason">Причина переоткрытия</FieldLabel>
                <Textarea
                  id="workflow-reopen-reason"
                  name="reason"
                  rows={2}
                  placeholder="Обязательно при запросе возврата завершенной проверки в работу"
                  className="w-full"
                  defaultValue={pendingReopen?.reason ?? ""}
                />
              </Field>
            </form>

            {canConfirmReopen ? (
              <form action={updateConversationWorkflow} className="mt-3 flex flex-wrap items-center gap-3">
                <ActionFlowGuard />
                <input type="hidden" name="conversationId" value={conversation.id} />
                <input type="hidden" name="workflowAction" value={CONFIRM_REOPEN_WORKFLOW_ACTION} />
                <input type="hidden" name="qaAssigneeId" value={conversation.qaAssigneeId ?? ""} />
                <input
                  type="hidden"
                  name="reviewDueAt"
                  value={toDateInputValue(conversation.reviewDueAt)}
                />
                <Button type="submit" variant="outline">
                  Подтвердить переоткрытие
                </Button>
                <p className="text-sm text-muted-foreground">Второй сотрудник подтверждает запрос и возвращает проверку в работу.</p>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
