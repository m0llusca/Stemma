import { describe, expect, it } from "vitest";

import {
  feedbackToastMessage,
  trainingStatusToastMessage
} from "@/lib/feedback-toast-messages";

describe("feedbackToastMessage", () => {
  it("returns a distinct confirmation for each feedback transition", () => {
    expect(feedbackToastMessage("acknowledged")).toBe("Оценка принята.");
    expect(feedbackToastMessage("appeal_opened")).toBe("Апелляция открыта.");
    expect(feedbackToastMessage("appeal_confirmed")).toBe("Оценка подтверждена.");
    expect(feedbackToastMessage("appeal_corrected")).toBe("Оценка скорректирована.");
    expect(feedbackToastMessage("reanswer_requested")).toBe("Запрошен переответ клиенту.");
    expect(feedbackToastMessage("reanswer_completed")).toBe("Переответ отмечен выполненным.");
  });

  it("falls back to a generic confirmation for unknown actions", () => {
    expect(feedbackToastMessage("something-else")).toBe("Обратная связь обновлена.");
  });
});

describe("trainingStatusToastMessage", () => {
  it("confirms closing and reopening a training assignment", () => {
    expect(trainingStatusToastMessage("done")).toBe("Учебная задача закрыта.");
    expect(trainingStatusToastMessage("open")).toBe("Учебная задача снова в работе.");
    expect(trainingStatusToastMessage("in_progress")).toBe("Учебная задача снова в работе.");
  });
});
