import type { Conversation, RoleName, User } from "@prisma/client";
import { ChevronDown } from "lucide-react";
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
    <details className="panel disclosure-panel mb-5 overflow-hidden">
      <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Управление проверкой</h2>
          <p className="mt-1 truncate text-sm text-[#667085]">
            {qaStatusLabels[conversation.qaStatus]} · {conversation.qaAssigneeName ?? "Проверяющий не назначен"} ·{" "}
            {conversation.reviewDueAt ? conversation.reviewDueAt.toLocaleDateString("ru-RU") : "без срока"}
          </p>
        </div>
        <span
          className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#0b4f52]"
          aria-hidden="true"
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      </summary>

      <form
        action={updateConversationWorkflow}
        className="grid gap-3 border-t border-[#d7dce5] p-4 md:grid-cols-[minmax(170px,200px)_minmax(180px,1fr)_minmax(150px,180px)_auto]"
      >
        <input type="hidden" name="conversationId" value={conversation.id} />

        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Состояние проверки
          <select
            name="qaStatus"
            defaultValue={conversation.qaStatus}
            className="rounded border border-[#d7dce5] bg-white px-3 py-2"
          >
            {qaStatuses.map((status) => (
              <option key={status} value={status}>
                {qaStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Проверяющий
          <select
            name="qaAssigneeId"
            defaultValue={conversation.qaAssigneeId ?? ""}
            className="rounded border border-[#d7dce5] bg-white px-3 py-2"
          >
            <option value="">Не назначен</option>
            {hasUnknownAssignee ? (
              <option value={conversation.qaAssigneeId ?? ""}>{conversation.qaAssigneeName ?? "Текущий исполнитель"}</option>
            ) : null}
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name} · {roleLabels[assignee.role]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Срок
          <input
            name="reviewDueAt"
            type="date"
            defaultValue={toDateInputValue(conversation.reviewDueAt)}
            className="rounded border border-[#d7dce5] bg-white px-3 py-2"
          />
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52] md:w-auto"
          >
            Обновить
          </button>
        </div>
      </form>
    </details>
  );
}
