import { describe, expect, it } from "vitest";
import {
  calibrationItemClosedBadge,
  calibrationSessionStatusLabel,
  calibrationSessionStatusTone
} from "@/lib/calibration/session-status";

describe("calibrationSessionStatusLabel", () => {
  it("does not call a waiting completed session «Завершена»", () => {
    expect(calibrationSessionStatusLabel("completed", 2)).toBe("Закрыта · ждут оценки");
    expect(calibrationSessionStatusTone("completed", 2)).toBe("warning");
    expect(calibrationItemClosedBadge("completed", 2)).toBe("Закрыта · ждут оценки");
  });

  it("keeps a fully scored completed session as «Завершена»", () => {
    expect(calibrationSessionStatusLabel("completed", 0)).toBe("Завершена");
    expect(calibrationSessionStatusTone("completed", 0)).toBe("success");
    expect(calibrationItemClosedBadge("completed", 0)).toBe("Завершена");
  });

  it("scopes archive the same way", () => {
    expect(calibrationSessionStatusLabel("archived", 1)).toBe("Архив · ждут оценки");
    expect(calibrationItemClosedBadge("archived", 0)).toBe("Архив");
  });
});
