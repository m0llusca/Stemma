import { describe, expect, it } from "vitest";
import { naiveOtrsDateToUtcIso, parseOtrsDate } from "@/lib/normalizers/otrs-family";

describe("naiveOtrsDateToUtcIso", () => {
  it("treats UTC as a no-op", () => {
    expect(naiveOtrsDateToUtcIso("2026-06-06T12:00:06", "UTC")).toBe("2026-06-06T12:00:06.000Z");
  });

  it("shifts Europe/Moscow wall-clock (-3h) to UTC", () => {
    expect(naiveOtrsDateToUtcIso("2026-06-06T12:00:06", "Europe/Moscow")).toBe("2026-06-06T09:00:06.000Z");
  });

  it("applies DST for a summer New York date (-4h)", () => {
    expect(naiveOtrsDateToUtcIso("2026-07-01T12:00:00", "America/New_York")).toBe("2026-07-01T16:00:00.000Z");
  });

  it("applies standard time for a winter New York date (-5h)", () => {
    expect(naiveOtrsDateToUtcIso("2026-01-15T12:00:00", "America/New_York")).toBe("2026-01-15T17:00:00.000Z");
  });
});

describe("parseOtrsDate timezone handling", () => {
  it("interprets a naive OTRS datetime in the given zone", () => {
    expect(parseOtrsDate("2026-06-06 12:00:06", new Date(0), "Europe/Moscow")).toBe("2026-06-06T09:00:06.000Z");
  });

  it("defaults to UTC when no zone is given (backward compatible)", () => {
    expect(parseOtrsDate("2026-06-06 12:00:06")).toBe("2026-06-06T12:00:06.000Z");
  });

  it("leaves a value that already has an offset untouched", () => {
    expect(parseOtrsDate("2026-06-06T12:00:06+03:00", new Date(0), "Europe/Moscow")).toBe("2026-06-06T09:00:06.000Z");
  });

  it("leaves a value that already has Z untouched", () => {
    expect(parseOtrsDate("2026-06-06T09:00:06Z", new Date(0), "Europe/Moscow")).toBe("2026-06-06T09:00:06.000Z");
  });

  it("passes numeric epoch seconds through unchanged regardless of zone", () => {
    expect(parseOtrsDate("0", new Date(0), "Europe/Moscow")).toBe("1970-01-01T00:00:00.000Z");
  });
});

import { normalizeOtrsFamilyTicket } from "@/lib/normalizers/otrs-family";

describe("normalizeOtrsFamilyTicket timezone threading", () => {
  const ticket = {
    TicketID: "1549105",
    TicketNumber: "2026060610000063",
    Title: "Тест",
    State: "open",
    Created: "2026-06-06 12:00:06",
    Article: [
      {
        ArticleID: "1",
        From: "customer@example.com",
        SenderType: "customer",
        Body: "Текст",
        Created: "2026-06-06 12:00:06",
        IsVisibleForCustomer: "1"
      }
    ]
  };

  it("applies the configured timezone to ticket and article timestamps", () => {
    const conversation = normalizeOtrsFamilyTicket(ticket, { source: "otrs", timeZone: "Europe/Moscow" });
    expect(conversation.openedAt).toBe("2026-06-06T09:00:06.000Z");
    expect(conversation.messages[0].sentAt).toBe("2026-06-06T09:00:06.000Z");
  });

  it("defaults to UTC when timeZone is omitted", () => {
    const conversation = normalizeOtrsFamilyTicket(ticket, { source: "otrs" });
    expect(conversation.openedAt).toBe("2026-06-06T12:00:06.000Z");
  });
});
