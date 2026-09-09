import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";

describe("CollapsibleContent keepMounted default", () => {
  it("keeps form fields in the document when the panel is collapsed", () => {
    render(
      <form>
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>
            <input name="score" defaultValue="3" data-testid="score-field" />
          </CollapsibleContent>
        </Collapsible>
      </form>
    );

    // Closed by default — field must remain mounted for FormData (legacy details behavior).
    const field = screen.getByTestId("score-field") as HTMLInputElement;
    expect(field).toBeDefined();
    expect(field.value).toBe("3");
    expect(field.closest("form")).not.toBeNull();

    const trigger = screen.getByRole("button", { name: "Toggle" });
    expect(trigger).toHaveAttribute("type", "button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("score-field")).toBeDefined();
  });

  it("does not submit the host form when a disclosure is toggled", () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>
            <input name="score" defaultValue="3" />
          </CollapsibleContent>
        </Collapsible>
        <button type="submit">Save</button>
      </form>
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Toggle" })).toHaveAttribute("aria-expanded", "true");
  });

  it("unmounts closed content when keepMounted is false", () => {
    render(
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent keepMounted={false}>
          <span data-testid="ephemeral">gone when closed</span>
        </CollapsibleContent>
      </Collapsible>
    );

    expect(screen.queryByTestId("ephemeral")).toBeNull();
  });
});
