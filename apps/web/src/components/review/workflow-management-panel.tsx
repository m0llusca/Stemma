import type { Conversation, RoleName, User } from "@prisma/client";
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
    <section className="panel mb-6 p-4">
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-end">
        <div>
          <h2 className="text-base font-semibold">Управление проверкой</h2>
          <p className="mt-1 text-sm leading-5 text-[#667085]">Состояние, исполнитель и срок ручной QA-проверки.</p>
        </div>

        <form
          action={updateConversationWorkflow}
          className="grid gap-3 md:grid-cols-[minmax(170px,200px)_minmax(180px,1fr)_minmax(150px,180px)_auto]"
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
            QA-исполнитель
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
            Дедлайн
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
      </div>
    </section>
  );
}
