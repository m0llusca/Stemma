import { describe, expect, it } from "vitest";
import {
  paginateReviewQueue,
  parseReviewQueuePage,
  reviewQueueDefaultPageSize
} from "@/lib/review-repository";
import type { ReviewQueueConversationDto } from "@/lib/contracts/review-queue";

function conversation(id: string): ReviewQueueConversationDto {
  return {
    id,
    subject: `Тема ${id}`,
    customerName: "Клиент",
    assigneeName: "Оператор",
    messageCount: 1,
    channel: "CHAT",
    externalSource: "custom_api",
    supportLine: "1ЛП",
    teamName: "Поддержка",
    reviewDueAt: null,
    qaStatus: "QUEUED",
    qaAssigneeName: null,
    csatBucket: "NO_SCORE",
    samplingType: "RANDOM",
    riskHint: null,
    priorityRank: 36,
    priorityReason: "Ожидает проверки",
    reviews: []
  };
}

const items = Array.from({ length: 7 }, (_, index) => conversation(String(index + 1)));

describe("parseReviewQueuePage", () => {
  it("defaults to page 1 for missing or junk values", () => {
    expect(parseReviewQueuePage(undefined)).toBe(1);
    expect(parseReviewQueuePage("")).toBe(1);
    expect(parseReviewQueuePage("0")).toBe(1);
    expect(parseReviewQueuePage("-3")).toBe(1);
    expect(parseReviewQueuePage("abc")).toBe(1);
  });

  it("reads a positive page and the first array entry", () => {
    expect(parseReviewQueuePage("4")).toBe(4);
    expect(parseReviewQueuePage(["2", "9"])).toBe(2);
  });
});

describe("paginateReviewQueue", () => {
  it("returns the requested slice without reordering", () => {
    const page = paginateReviewQueue(items, 1, 3);

    expect(page.items.map((item) => item.id)).toEqual(["1", "2", "3"]);
    expect(page).toMatchObject({ page: 1, pageSize: 3, pageCount: 3, total: 7, hasMore: true });
  });

  it("slices the middle and last pages", () => {
    expect(paginateReviewQueue(items, 2, 3).items.map((item) => item.id)).toEqual(["4", "5", "6"]);

    const last = paginateReviewQueue(items, 3, 3);
    expect(last.items.map((item) => item.id)).toEqual(["7"]);
    expect(last.hasMore).toBe(false);
  });

  it("clamps an out-of-range page to the last page", () => {
    const page = paginateReviewQueue(items, 99, 3);
    expect(page.page).toBe(3);
    expect(page.items.map((item) => item.id)).toEqual(["7"]);
    expect(page.hasMore).toBe(false);
  });

  it("treats an empty queue as a single empty page", () => {
    const page = paginateReviewQueue([], 1, reviewQueueDefaultPageSize);
    expect(page).toEqual({ items: [], page: 1, pageSize: reviewQueueDefaultPageSize, pageCount: 1, total: 0, hasMore: false });
  });

  it("preserves the global ordering across pages (concatenated pages equal the input)", () => {
    const pageSize = 3;
    const pageCount = paginateReviewQueue(items, 1, pageSize).pageCount;
    const recombined = Array.from({ length: pageCount }, (_, index) => paginateReviewQueue(items, index + 1, pageSize).items).flat();

    expect(recombined.map((item) => item.id)).toEqual(items.map((item) => item.id));
  });
});
