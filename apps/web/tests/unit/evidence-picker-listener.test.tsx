import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  ALL_EVIDENCE_CRITERIA_FILLED_HINT,
  EvidenceDraftProvider,
  EvidenceMessageSelect,
  resolveEvidenceAttachTarget,
  useEvidenceDraft
} from "@/components/review/evidence-draft";
import { EvidenceMessageButton } from "@/components/review/evidence-message-button";
import { LiveEvidenceGroupChip, LiveEvidenceTotal } from "@/components/review/evidence-live-count";
import {
  applyEvidenceMessageSelection,
  EvidencePickerListener
} from "@/components/review/evidence-picker-listener";
import { ToastProvider } from "@/components/ui/toast";

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

function EvidenceHarness({
  initialByCriterion = { tone: "", empathy: "" },
  withToast = false
}: {
  initialByCriterion?: { tone: string; empathy: string };
  withToast?: boolean;
} = {}) {
  const filledCount = Object.values(initialByCriterion).filter(Boolean).length;
  const tree = (
    <EvidenceDraftProvider
      criterionIds={["tone", "empathy"]}
      initialByCriterion={initialByCriterion}
      allowedMessageIds={["message-client", "message-operator"]}
    >
      <LiveEvidenceTotal initialCount={filledCount} />
      <LiveEvidenceGroupChip criterionIds={["tone", "empathy"]} initialCount={filledCount} />
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

  return withToast ? <ToastProvider>{tree}</ToastProvider> : tree;
}

async function flushEvidenceSelectBlur() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  });
}

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
});

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

  it("does not silently overwrite the first select when every criterion already has evidence", async () => {
    render(
      <EvidenceHarness
        initialByCriterion={{ tone: "message-client", empathy: "message-operator" }}
        withToast
      />
    );

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "В доказательство" })[1]).not.toBeDisabled();
    });

    expect(screen.getByRole("combobox", { name: "Доказательство тона" })).toHaveValue("message-client");
    expect(screen.getByRole("combobox", { name: "Доказательство эмпатии" })).toHaveValue("message-operator");
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveTextContent("2");
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveAttribute(
      "data-review-evidence-dirty",
      "false"
    );
    expect(screen.getByText("2 доказ.")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "В доказательство" })[1]);

    expect(screen.getByRole("combobox", { name: "Доказательство тона" })).toHaveValue("message-client");
    expect(screen.getByRole("combobox", { name: "Доказательство эмпатии" })).toHaveValue("message-operator");
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveTextContent("2");
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveAttribute(
      "data-review-evidence-dirty",
      "false"
    );
    expect(screen.getByText("2 доказ.")).toBeInTheDocument();
    expect(await screen.findByText(ALL_EVIDENCE_CRITERIA_FILLED_HINT)).toBeInTheDocument();
  });

  it("replaces the focused criterion when every slot is already filled", async () => {
    render(
      <EvidenceHarness
        initialByCriterion={{ tone: "message-client", empathy: "message-operator" }}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "В доказательство" })[0]).not.toBeDisabled();
    });

    fireEvent.focus(screen.getByRole("combobox", { name: "Доказательство эмпатии" }));
    fireEvent.click(screen.getAllByRole("button", { name: "В доказательство" })[0]);

    expect(screen.getByRole("combobox", { name: "Доказательство тона" })).toHaveValue("message-client");
    expect(screen.getByRole("combobox", { name: "Доказательство эмпатии" })).toHaveValue("message-client");
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveTextContent("2");
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveAttribute(
      "data-review-evidence-dirty",
      "true"
    );
    expect(screen.getByText("2 доказ.")).toBeInTheDocument();
  });

  it("clears sticky focus after the evidence select blurs so a later full-slots click toasts", async () => {
    render(
      <EvidenceHarness
        initialByCriterion={{ tone: "message-client", empathy: "message-operator" }}
        withToast
      />
    );

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "В доказательство" })[0]).not.toBeDisabled();
    });

    fireEvent.focus(screen.getByRole("combobox", { name: "Доказательство эмпатии" }));
    fireEvent.blur(screen.getByRole("combobox", { name: "Доказательство эмпатии" }));
    await flushEvidenceSelectBlur();

    fireEvent.click(screen.getAllByRole("button", { name: "В доказательство" })[0]);

    expect(screen.getByRole("combobox", { name: "Доказательство тона" })).toHaveValue("message-client");
    expect(screen.getByRole("combobox", { name: "Доказательство эмпатии" })).toHaveValue("message-operator");
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveTextContent("2");
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveAttribute(
      "data-review-evidence-dirty",
      "false"
    );
    expect(await screen.findByText(ALL_EVIDENCE_CRITERIA_FILLED_HINT)).toBeInTheDocument();
  });

  it("still replaces the focused criterion when blur is part of the same click", async () => {
    render(
      <EvidenceHarness
        initialByCriterion={{ tone: "message-client", empathy: "message-operator" }}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "В доказательство" })[0]).not.toBeDisabled();
    });

    fireEvent.focus(screen.getByRole("combobox", { name: "Доказательство эмпатии" }));
    fireEvent.blur(screen.getByRole("combobox", { name: "Доказательство эмпатии" }));
    fireEvent.click(screen.getAllByRole("button", { name: "В доказательство" })[0]);

    expect(screen.getByRole("combobox", { name: "Доказательство тона" })).toHaveValue("message-client");
    expect(screen.getByRole("combobox", { name: "Доказательство эмпатии" })).toHaveValue("message-client");
    expect(document.querySelector("[data-slot=review-evidence-count]")).toHaveTextContent("2");
    expect(screen.queryByText(ALL_EVIDENCE_CRITERIA_FILLED_HINT)).not.toBeInTheDocument();
  });
});

describe("resolveEvidenceAttachTarget", () => {
  it("prefers a focused criterion, then the first empty slot, and never the first filled", () => {
    expect(resolveEvidenceAttachTarget({ tone: "m1", empathy: "" }, null)).toBe("empathy");
    expect(resolveEvidenceAttachTarget({ tone: "m1", empathy: "m2" }, "empathy")).toBe("empathy");
    expect(resolveEvidenceAttachTarget({ tone: "m1", empathy: "m2" }, null)).toBeNull();
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

  it("does not fall back to the first filled select when every criterion already has evidence", () => {
    render(
      <>
        <label>
          Тон
          <select name="criterion.tone.evidenceMessageId" aria-label="Тон" defaultValue="message-operator">
            <option value="">Не выбрано</option>
            <option value="message-operator">Оператор</option>
            <option value="message-client">Клиент</option>
          </select>
        </label>
        <label>
          Эмпатия
          <select name="criterion.empathy.evidenceMessageId" aria-label="Эмпатия" defaultValue="message-client">
            <option value="">Не выбрано</option>
            <option value="message-operator">Оператор</option>
            <option value="message-client">Клиент</option>
          </select>
        </label>
      </>
    );

    expect(applyEvidenceMessageSelection("message-client")).toBe(false);
    expect(screen.getByRole("combobox", { name: "Тон" })).toHaveValue("message-operator");
    expect(screen.getByRole("combobox", { name: "Эмпатия" })).toHaveValue("message-client");
  });
});

function DomFallbackHarness() {
  return (
    <>
      <EvidencePickerListener />
      <label>
        Тон
        <select name="criterion.tone.evidenceMessageId" aria-label="Тон" defaultValue="message-operator">
          <option value="">Не выбрано</option>
          <option value="message-operator">Оператор</option>
          <option value="message-client">Клиент</option>
        </select>
      </label>
      <label>
        Эмпатия
        <select name="criterion.empathy.evidenceMessageId" aria-label="Эмпатия" defaultValue="message-client">
          <option value="">Не выбрано</option>
          <option value="message-operator">Оператор</option>
          <option value="message-client">Клиент</option>
        </select>
      </label>
      <EvidenceMessageButton messageId="message-operator" />
    </>
  );
}

function focusEvidenceSelect(select: HTMLElement) {
  fireEvent.focus(select);
  fireEvent.focusIn(select);
}

function blurEvidenceSelect(select: HTMLElement) {
  fireEvent.blur(select);
  fireEvent.focusOut(select);
}

describe("EvidencePickerListener DOM fallback", () => {
  it("clears sticky activeSelectRef after blur so a later full-slots click does not rewrite", async () => {
    render(<DomFallbackHarness />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "В доказательство" })).not.toBeDisabled();
    });

    const empathy = screen.getByRole("combobox", { name: "Эмпатия" });
    focusEvidenceSelect(empathy);
    blurEvidenceSelect(empathy);
    await flushEvidenceSelectBlur();

    fireEvent.click(screen.getByRole("button", { name: "В доказательство" }));

    expect(screen.getByRole("combobox", { name: "Тон" })).toHaveValue("message-operator");
    expect(empathy).toHaveValue("message-client");
  });

  it("still replaces the focused select when blur is part of the same click", async () => {
    render(<DomFallbackHarness />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "В доказательство" })).not.toBeDisabled();
    });

    const empathy = screen.getByRole("combobox", { name: "Эмпатия" });
    focusEvidenceSelect(empathy);
    blurEvidenceSelect(empathy);
    fireEvent.click(screen.getByRole("button", { name: "В доказательство" }));

    expect(screen.getByRole("combobox", { name: "Тон" })).toHaveValue("message-operator");
    expect(empathy).toHaveValue("message-operator");
  });
});
