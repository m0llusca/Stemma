import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(screen.getByTestId("score-field")).toBeDefined();
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
