import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import type { Message } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConversationTimeline,
  type CoachingPinView
} from "@/components/review/conversation-timeline";
import { EvidenceJumpLink } from "@/components/review/evidence-jump-link";

const actionMocks = vi.hoisted(() => ({
  createCoachingPin: vi.fn(async (_formData: FormData) => undefined),
  deleteCoachingPin: vi.fn(async (_formData: FormData) => undefined),
  toggleCoachingPinResolved: vi.fn(async (_formData: FormData) => undefined)
}));

vi.mock("@/lib/coaching-pin-actions", () => ({
  createCoachingPin: actionMocks.createCoachingPin,
  deleteCoachingPin: actionMocks.deleteCoachingPin,
  toggleCoachingPinResolved: actionMocks.toggleCoachingPinResolved
}));

const sentAt = new Date("2026-07-27T09:34:00.000Z");
const longLink =
  "https://support.example.test/очень-длинная-ссылка-без-разрывов/идентификатор-обращения-1234567890";

function message(
  overrides: Partial<Message> &
    Pick<Message, "id" | "participantType" | "authorName" | "body">
): Message {
  return {
    conversationId: "conversation-1",
    externalId: `external-${overrides.id}`,
    sentAt,
    isPrivate: false,
    createdAt: sentAt,
    ...overrides
  };
}

const messages: Message[] = [
  message({
    id: "message-customer",
    participantType: "CUSTOMER",
    authorName: "Мария Петрова",
    body: `Не открывается заказ: ${longLink}`
  }),
  message({
    id: "message-human",
    participantType: "HUMAN_AGENT",
    authorName: "Анна Смирнова",
    body: "Проверю заказ и вернусь с ответом.",
    isPrivate: true
  }),
  message({
    id: "message-ai",
    participantType: "AI_AGENT",
    authorName: "Помощник ИИ",
    body: "Черновик ответа готов."
  }),
  message({
    id: "message-system",
    participantType: "SYSTEM",
    authorName: "Система",
    body: "Диалог передан в контроль качества."
  })
];

const coachingPins: CoachingPinView[] = [
  {
    id: "pin-1",
    messageId: "message-human",
    body: "Уточнить ожидаемый срок ответа.",
    resolvedAt: null,
    createdAt: sentAt,
    author: {
      id: "qa-1",
      name: "Ирина QA",
      role: "QA_ANALYST"
    }
  }
];

describe("ConversationTimeline", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("keeps every party and message affordance in an accessible, overflow-safe structure", () => {
    const { container } = render(
      <ConversationTimeline
        messages={messages}
        highlightedMessageIds={["message-human"]}
        conversationId="conversation-1"
        coachingPins={coachingPins}
        canCoach
        canManagePins
        currentUserId="qa-1"
      />
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Таймлайн диалога" })
    ).toBeInTheDocument();
    expect(screen.getByText("4 сообщения")).toBeInTheDocument();

    const messageArticles = container.querySelectorAll<HTMLElement>(
      '[data-slot="conversation-message"]'
    );
    expect(messageArticles).toHaveLength(4);

    const customer = container.querySelector<HTMLElement>('[data-party="CUSTOMER"]');
    const human = container.querySelector<HTMLElement>('[data-party="HUMAN_AGENT"]');
    const ai = container.querySelector<HTMLElement>('[data-party="AI_AGENT"]');
    const system = container.querySelector<HTMLElement>('[data-party="SYSTEM"]');

    expect(customer).toHaveAttribute("id", "msg-message-customer");
    expect(human).toHaveAttribute("id", "msg-message-human");
    expect(ai).toHaveAttribute("id", "msg-message-ai");
    expect(system).toHaveAttribute("id", "msg-message-system");

    const avatars = container.querySelectorAll<HTMLElement>(
      '[data-slot="conversation-message-avatar"]'
    );
    const contents = container.querySelectorAll<HTMLElement>(
      '[data-slot="conversation-message-content"]'
    );
    expect(avatars).toHaveLength(4);
    expect(contents).toHaveLength(4);
    expect(avatars[0]).toHaveTextContent("МП");
    for (const article of messageArticles) {
      expect(
        article.querySelector('[data-slot="conversation-message-avatar"]')
      ).toBeInTheDocument();
      expect(
        article.querySelector('[data-slot="conversation-message-content"]')
      ).toBeInTheDocument();
    }
    for (const avatar of avatars) {
      expect(avatar).toHaveAttribute("aria-hidden", "true");
    }

    const longMessageBody = screen.getByText(/очень-длинная-ссылка-без-разрывов/);
    expect(longMessageBody).toBeInTheDocument();
    expect(within(human as HTMLElement).getByText("Доказательство")).toBeInTheDocument();
    expect(within(human as HTMLElement).getByText("Приватно")).toBeInTheDocument();
    expect(within(ai as HTMLElement).getAllByText("ИИ").length).toBeGreaterThan(0);
    expect(within(system as HTMLElement).getAllByText("Система")).toHaveLength(2);
    expect(screen.getByText("Уточнить ожидаемый срок ответа.")).toBeInTheDocument();

    const times = container.querySelectorAll("time[datetime]");
    expect(times).toHaveLength(5);
    expect(times[0]).toHaveAttribute("datetime", sentAt.toISOString());
    expect(times[0]).not.toBeEmptyDOMElement();

    expect(screen.getAllByRole("button", { name: "В доказательство" })).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "+ Заметка к сообщению" })).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Отметить решённой" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить" })).toBeInTheDocument();
    const pinIdFields = screen.getAllByDisplayValue("pin-1");
    expect(pinIdFields).toHaveLength(2);
    expect(pinIdFields[0]).toHaveAttribute("name", "pinId");

    for (const article of messageArticles) {
      expect(article).not.toHaveTextContent("undefined");
      expect(article).not.toHaveTextContent("null");
    }
  });

  it("keeps the minimal local wrapping contract that jsdom cannot measure", () => {
    const { container } = render(<ConversationTimeline messages={messages} />);
    const cardHeader = container.querySelector<HTMLElement>('[data-slot="card-header"]');
    const customer = container.querySelector<HTMLElement>('[data-party="CUSTOMER"]');
    const human = container.querySelector<HTMLElement>('[data-party="HUMAN_AGENT"]');
    const system = container.querySelector<HTMLElement>('[data-party="SYSTEM"]');

    expect(cardHeader).toHaveClass("flex", "flex-wrap");
    expect(customer?.querySelector(".conversation-message__header")).toHaveClass(
      "flex",
      "flex-wrap"
    );

    const agentSurface = human?.querySelector(".conversation-message__bubble");
    const systemSurface = system?.querySelector(".conversation-message__plain");
    const longMessageBody = screen.getByText(/очень-длинная-ссылка-без-разрывов/);

    expect(agentSurface).toHaveClass("max-w-prose");
    expect(systemSurface).toBeInTheDocument();
    expect(systemSurface).not.toHaveClass("conversation-message__bubble");
    expect(longMessageBody).toHaveClass("whitespace-pre-wrap", "break-words");
    expect(longMessageBody).not.toHaveClass("break-all");
  });

  it("flashes an evidence target and lets its action select the active evidence field", () => {
    vi.useFakeTimers();
    const { container } = render(
      <>
        <label>
          Доказательство критерия
          <select
            name="criterion.tone.evidenceMessageId"
            aria-label="Доказательство критерия"
            defaultValue=""
          >
            <option value="">Не выбрано</option>
            <option value="message-human">Ответ оператора</option>
          </select>
        </label>
        <EvidenceJumpLink messageId="message-human" timeLabel="12:34" />
        <ConversationTimeline messages={[messages[1]]} />
      </>
    );
    const target = container.querySelector<HTMLElement>("#msg-message-human");
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });

    fireEvent.click(
      screen.getByRole("link", {
        name: "Перейти к сообщению-доказательству, 12:34"
      })
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center"
    });
    expect(target).toHaveClass("conversation-message--evidence-flash");
    expect(target).toHaveClass(
      "[&.conversation-message--evidence-flash]:bg-primary/10",
      "[&.conversation-message--evidence-flash]:ring-2",
      "motion-safe:[&.conversation-message--evidence-flash]:animate-pulse",
      "motion-reduce:[&.conversation-message--evidence-flash]:animate-none"
    );

    act(() => {
      vi.runAllTimers();
    });
    expect(target).not.toHaveClass("conversation-message--evidence-flash");

    const evidenceField = screen.getByRole("combobox", {
      name: "Доказательство критерия"
    });
    fireEvent.click(
      within(target as HTMLElement).getByRole("button", {
        name: "В доказательство"
      })
    );

    expect(evidenceField).toHaveValue("message-human");
    expect(evidenceField).toHaveFocus();
  });

  it("opens the message composer and submits its conversation and message IDs", async () => {
    const { container } = render(
      <ConversationTimeline
        messages={[messages[1]]}
        conversationId="conversation-1"
        canCoach
      />
    );
    const messageArticle = container.querySelector<HTMLElement>(
      '[data-party="HUMAN_AGENT"]'
    );

    fireEvent.click(
      within(messageArticle as HTMLElement).getByRole("button", {
        name: "+ Заметка к сообщению"
      })
    );

    const bodyField = screen.getByPlaceholderText(
      "Что обсудить по этому сообщению на калибровке?"
    );
    const composer = bodyField.closest("form");
    expect(composer).toBeInTheDocument();
    expect(
      composer?.querySelector(
        'input[type="hidden"][name="conversationId"][value="conversation-1"]'
      )
    ).toBeInTheDocument();
    expect(
      composer?.querySelector(
        'input[type="hidden"][name="messageId"][value="message-human"]'
      )
    ).toBeInTheDocument();

    fireEvent.change(bodyField, {
      target: { value: "Разобрать обещание срока на калибровке." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить заметку" }));

    await waitFor(() => {
      expect(actionMocks.createCoachingPin).toHaveBeenCalledTimes(1);
    });
    const submittedData = actionMocks.createCoachingPin.mock.calls[0][0] as FormData;
    expect(submittedData.get("conversationId")).toBe("conversation-1");
    expect(submittedData.get("messageId")).toBe("message-human");
    expect(submittedData.get("body")).toBe(
      "Разобрать обещание срока на калибровке."
    );
  });

  it("submits the preserved coaching-pin mutation IDs to both server actions", async () => {
    render(
      <ConversationTimeline
        messages={[messages[1]]}
        coachingPins={coachingPins}
        canManagePins
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Отметить решённой" }));
    await waitFor(() => {
      expect(actionMocks.toggleCoachingPinResolved).toHaveBeenCalledTimes(1);
    });
    const toggleData = actionMocks.toggleCoachingPinResolved.mock
      .calls[0][0] as FormData;
    expect(toggleData.get("pinId")).toBe("pin-1");

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    await waitFor(() => {
      expect(actionMocks.deleteCoachingPin).toHaveBeenCalledTimes(1);
    });
    const deleteData = actionMocks.deleteCoachingPin.mock.calls[0][0] as FormData;
    expect(deleteData.get("pinId")).toBe("pin-1");
  });
});
