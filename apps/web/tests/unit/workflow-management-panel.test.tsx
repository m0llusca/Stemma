import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkflowManagementPanel } from "@/components/review/workflow-management-panel";

vi.mock("@/lib/review-workflow-actions", () => ({
  updateConversationWorkflow: vi.fn()
}));

const conversation = {
  id: "conversation-1",
  qaStatus: "IN_PROGRESS" as const,
  qaAssigneeId: "qa-1",
  qaAssigneeName: "Мария Кузнецова",
  reviewDueAt: new Date("2026-07-29T00:00:00.000Z")
};

const assignees = [
  {
    id: "qa-1",
    name: "Мария Кузнецова",
    role: "QA_ANALYST" as const
  }
];

function renderOpenPanel() {
  render(
    <WorkflowManagementPanel
      conversation={conversation}
      assignees={assignees}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Управление проверкой/ })
  );
}

describe("WorkflowManagementPanel", () => {
  it.each([
    {
      label: "Состояние проверки",
      id: "workflow-qa-status",
      name: "qaStatus",
      value: "IN_PROGRESS"
    },
    {
      label: "Проверяющий",
      id: "workflow-qa-assignee",
      name: "qaAssigneeId",
      value: "qa-1"
    },
    {
      label: "Срок",
      id: "workflow-review-due-at",
      name: "reviewDueAt",
      value: "2026-07-29"
    }
  ])(
    "associates the visible $label label with its submitted control",
    ({ label, id, name, value }) => {
      renderOpenPanel();

      const control = screen.getByLabelText(label);
      const visibleLabel = screen.getByText(label, { selector: "label" });

      expect(control).toHaveAttribute("id", id);
      expect(control).toHaveAttribute("name", name);
      expect(control).toHaveValue(value);
      expect(visibleLabel).toHaveAttribute("for", id);
    }
  );
});
