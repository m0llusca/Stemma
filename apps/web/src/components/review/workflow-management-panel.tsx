import type { Conversation, RoleName, User } from "@prisma/client";
import { ChevronDown } from "lucide-react";
import { ActionFlowGuard } from "@/components/action-flow-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { qaStatusLabels, roleLabels } from "@/lib/labels";
import { updateConversationWorkflow } from "@/lib/review-workflow-actions";

type WorkflowConversation = Pick<Conversation, "id" | "qaStatus" | "qaAssigneeId" | "qaAssigneeName" | "reviewDueAt">;

type WorkflowAssignee = Pick<User, "id" | "name"> & {
  role: RoleName;
};

type WorkflowManagementPanelProps = {
  conversation: WorkflowConversation;
  assignees: WorkflowAssignee[];
};

const qaStatuses = ["QUEUED", "ASSIGNED", "IN_PROGRESS", "FINALIZED", "REOPENED"] as const;

function toDateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function WorkflowManagementPanel({ conversation, assignees }: WorkflowManagementPanelProps) {
  const hasUnknownAssignee =
    conversation.qaAssigneeId !== null && !assignees.some((assignee) => assignee.id === conversation.qaAssigneeId);

  return (
    <Collapsible className="group overflow-clip rounded-xl bg-card ring-1 ring-foreground/10">
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Управление проверкой</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {qaStatusLabels[conversation.qaStatus]} · {conversation.qaAssigneeName ?? "Проверяющий не назначен"} ·{" "}
            {conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "без срока"}
          </p>
        </div>
        <span
          className="disclosure-chevron flex size-8 shrink-0 items-center justify-center rounded-md text-primary transition-transform group-data-open:rotate-180"
          aria-hidden="true"
        >
          <ChevronDown className="size-4" />
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <Card className="rounded-none border-0 ring-0">
          <CardHeader className="border-t border-border py-0 sr-only">
            <CardTitle>Параметры проверки</CardTitle>
            <CardDescription>Статус проверки, исполнитель и срок</CardDescription>
          </CardHeader>
          <CardContent className="border-t border-border pt-4">
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
                      {qaStatusLabels[status]}
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
                  Обновить
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
