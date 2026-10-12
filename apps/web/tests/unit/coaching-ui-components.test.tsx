import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CoachingAssignmentItem } from "@/components/coaching/coaching-assignment-item";
import { CoachingPlanProgress } from "@/components/coaching/coaching-plan-progress";
import { ItemGroup } from "@/components/ui/item";

describe("coaching plan progress", () => {
  it("exposes real task counts as the progress range", () => {
    render(<CoachingPlanProgress title="Обратная связь" done={2} total={7} />);
    const progress = screen.getByRole("progressbar", { name: "Прогресс плана «Обратная связь»" });
    expect(progress).toHaveAttribute("aria-valuenow", "2");
    expect(progress).toHaveAttribute("aria-valuemax", "7");
    expect(progress).toHaveAttribute("aria-valuetext", "2/7 закрыто");
    expect(screen.getByText("2/7 закрыто")).toBeInTheDocument();
  });

  it("states that an empty plan has no tasks and retains a valid accessible range", () => {
    render(<CoachingPlanProgress title="Новый план" done={0} total={0} />);
    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuenow", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "1");
    expect(progress).toHaveAttribute("aria-valuetext", "В плане пока нет задач");
    expect(screen.getByText("В плане пока нет задач")).toBeInTheDocument();
    expect(screen.queryByText(/%|0\/0/)).not.toBeInTheDocument();
  });
});

describe("coaching assignment composition", () => {
  it("retains task identity, status, context, review link and the submitted status fields", () => {
    const submit = vi.fn((event) => event.preventDefault());
    render(
      <ItemGroup aria-label="Учебные задачи">
        <CoachingAssignmentItem
          title="Проверить ответ"
          description="Уточнить следующий шаг"
          assigneeName="Анна Иванова"
          dueLabel="до 12.10.2026"
          overdue
          dueThisWeek={false}
          isPriority
          status={<span>В работе</span>}
          context={<span>Обращение T-123 · высокий риск</span>}
          actions={
            <>
              <a href="/reviews/conversation-1">К замечанию</a>
              <form onSubmit={submit} aria-label="Статус задачи">
                <input type="hidden" name="id" value="assignment-1" />
                <input type="hidden" name="status" value="done" />
                <button type="submit">Готово</button>
              </form>
            </>
          }
        />
      </ItemGroup>
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Анна Иванова")).toBeVisible();
    expect(screen.getByText("Следующий")).toBeVisible();
    expect(screen.getByText("до 12.10.2026")).toBeVisible();
    expect(screen.getByText("В работе")).toBeVisible();
    expect(screen.getByText("Обращение T-123 · высокий риск")).toBeVisible();
    expect(screen.getByRole("link", { name: "К замечанию" })).toHaveAttribute("href", "/reviews/conversation-1");
    const form = screen.getByRole("form", { name: "Статус задачи" }) as HTMLFormElement;
    expect(Object.fromEntries(new FormData(form))).toEqual({ id: "assignment-1", status: "done" });
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    expect(submit).toHaveBeenCalledOnce();
  });
});
