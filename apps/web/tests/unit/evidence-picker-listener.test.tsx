import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EvidenceMessageButton } from "@/components/review/evidence-message-button";
import { LiveEvidenceGroupChip, LiveEvidenceTotal } from "@/components/review/evidence-live-count";
import { applyEvidenceMessageSelection } from "@/components/review/evidence-picker-listener";

function EvidenceHarness() {
  return (
    <>
      <LiveEvidenceTotal initialCount={0} />
      <LiveEvidenceGroupChip criterionIds={["tone", "empathy"]} initialCount={0} />
      <label>
        Доказательство критерия
        <select name="criterion.tone.evidenceMessageId" aria-label="Доказательство тона" defaultValue="">
          <option value="">Не выбрано</option>
          <option value="message-client">Клиент</option>
          <option value="message-operator">Оператор</option>
        </select>
      </label>
      <label>
        Доказательство эмпатии
        <select name="criterion.empathy.evidenceMessageId" aria-label="Доказательство эмпатии" defaultValue="">
          <option value="">Не выбрано</option>
          <option value="message-client">Клиент</option>
          <option value="message-operator">Оператор</option>
        </select>
      </label>
      <button type="button" id="msg-message-client">
        реплика клиента
      </button>
      <EvidenceMessageButton messageId="message-client" />
      <EvidenceMessageButton messageId="message-operator" />
    </>
  );
}

describe("applyEvidenceMessageSelection", () => {
  it("puts the clicked reply into the first empty criterion and grows the live count", async () => {
    render(<EvidenceHarness />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "В доказательство" })[0]).not.toBeDisabled();
    });

    expect(screen.getByRole("combobox", { name: "Доказательство тона" })).toHaveValue("");
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveTextContent("0");
    expect(screen.queryByText("1 доказ.")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "В доказательство" })[0]);

    expect(screen.getByRole("combobox", { name: "Доказательство тона" })).toHaveValue("message-client");
    expect(screen.getByRole("combobox", { name: "Доказательство эмпатии" })).toHaveValue("");
    await waitFor(() => {
      expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveTextContent("1");
    });
    expect(screen.getByText("1 доказ.")).toBeInTheDocument();
    expect(screen.getByText("Подсвечены в таймлайне диалога.")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "В доказательство" })[1]);

    expect(screen.getByRole("combobox", { name: "Доказательство тона" })).toHaveValue("message-client");
    expect(screen.getByRole("combobox", { name: "Доказательство эмпатии" })).toHaveValue("message-operator");
    await waitFor(() => {
      expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveTextContent("2");
    });
    expect(screen.getByText("2 доказ.")).toBeInTheDocument();
  });

  it("keeps a focused criterion when the reviewer already picked that field", () => {
    render(
      <label>
        Активный критерий
        <select name="criterion.tone.evidenceMessageId" aria-label="Активный критерий" defaultValue="">
          <option value="">Не выбрано</option>
          <option value="message-operator">Оператор</option>
        </select>
      </label>
    );

    const select = screen.getByRole("combobox", { name: "Активный критерий" });
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error("expected a native evidence select");
    }
    select.focus();
    expect(applyEvidenceMessageSelection("message-operator", select)).toBe(true);
    expect(select).toHaveValue("message-operator");
  });
});
