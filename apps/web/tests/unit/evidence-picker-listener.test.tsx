import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EvidenceDraftProvider,
  EvidenceMessageSelect,
  useEvidenceDraft
} from "@/components/review/evidence-draft";
import { EvidenceMessageButton } from "@/components/review/evidence-message-button";
import { LiveEvidenceGroupChip, LiveEvidenceTotal } from "@/components/review/evidence-live-count";
import { applyEvidenceMessageSelection } from "@/components/review/evidence-picker-listener";

const messages = [
  {
    id: "message-client",
    authorName: "Мила",
    body: "Клиент просит возврат",
    sentAt: new Date("2026-09-01T10:00:00.000Z")
  },
  {
    id: "message-operator",
    authorName: "Иван",
    body: "Оператор предлагает варианты",
    sentAt: new Date("2026-09-01T10:05:00.000Z")
  }
];

function DraftCountProbe() {
  const { count, isDirty, byCriterion } = useEvidenceDraft();

  return (
    <div>
      <strong data-slot="review-evidence-count">{count}</strong>
      <span data-slot="review-evidence-dirty">{isDirty ? "dirty" : "clean"}</span>
      <span data-slot="review-evidence-tone">{byCriterion.tone ?? ""}</span>
    </div>
  );
}

function EvidenceHarness() {
  return (
    <EvidenceDraftProvider
      criterionIds={["tone", "empathy"]}
      initialByCriterion={{ tone: "", empathy: "" }}
      allowedMessageIds={["message-client", "message-operator"]}
    >
      <LiveEvidenceTotal initialCount={0} />
      <LiveEvidenceGroupChip criterionIds={["tone", "empathy"]} initialCount={0} />
      <label>
        Доказательство тона
        <EvidenceMessageSelect criterionId="tone" messages={messages} />
      </label>
      <label>
        Доказательство эмпатии
        <EvidenceMessageSelect criterionId="empathy" messages={messages} />
      </label>
      <button type="button" id="msg-message-client">
        реплика клиента
      </button>
      <EvidenceMessageButton messageId="message-client" />
      <EvidenceMessageButton messageId="message-operator" />
    </EvidenceDraftProvider>
  );
}

describe("evidence draft state", () => {
  it("grows the counter from React draft state without writing a DOM select", () => {
    function AttachOnly() {
      const { attachMessage } = useEvidenceDraft();

      return (
        <>
          <DraftCountProbe />
          <button type="button" onClick={() => attachMessage("message-client")}>
            attach
          </button>
        </>
      );
    }

    render(
      <EvidenceDraftProvider
        criterionIds={["tone", "empathy"]}
        initialByCriterion={{ tone: "", empathy: "" }}
        allowedMessageIds={["message-client"]}
      >
        <AttachOnly />
      </EvidenceDraftProvider>
    );

    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveTextContent("0");
    expect(document.querySelector("[data-slot=review-evidence-dirty]")).toHaveTextContent("clean");
    expect(document.querySelector("select")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "attach" }));

    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveTextContent("1");
    expect(document.querySelector("[data-slot=review-evidence-dirty]")).toHaveTextContent("dirty");
    expect(document.querySelector("[data-slot=review-evidence-tone]")).toHaveTextContent("message-client");
  });

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
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveTextContent("1");
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveAttribute(
      "data-review-evidence-dirty",
      "true"
    );
    expect(screen.getByText("1 доказ.")).toBeInTheDocument();
    expect(screen.getByText("Подсвечены в таймлайне диалога.")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "В доказательство" })[1]);

    expect(screen.getByRole("combobox", { name: "Доказательство тона" })).toHaveValue("message-client");
    expect(screen.getByRole("combobox", { name: "Доказательство эмпатии" })).toHaveValue("message-operator");
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveTextContent("2");
    expect(screen.getByText("2 доказ.")).toBeInTheDocument();
  });

  it("keeps a focused criterion when the reviewer already picked that field", async () => {
    render(<EvidenceHarness />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "В доказательство" })[0]).not.toBeDisabled();
    });

    fireEvent.focus(screen.getByRole("combobox", { name: "Доказательство эмпатии" }));
    fireEvent.click(screen.getAllByRole("button", { name: "В доказательство" })[0]);

    expect(screen.getByRole("combobox", { name: "Доказательство тона" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Доказательство эмпатии" })).toHaveValue("message-client");
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveTextContent("1");
  });
});

describe("applyEvidenceMessageSelection", () => {
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
