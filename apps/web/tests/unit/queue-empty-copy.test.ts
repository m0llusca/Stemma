import { describe, expect, it } from "vitest";
import {
  QUEUE_EMPTY_BANNER_FILTERED,
  QUEUE_EMPTY_BANNER_GLOBAL,
  QUEUE_TABLE_EMPTY_FILTERED_DESCRIPTION,
  QUEUE_TABLE_EMPTY_FILTERED_TITLE,
  QUEUE_TABLE_EMPTY_GLOBAL_DESCRIPTION,
  QUEUE_TABLE_EMPTY_GLOBAL_TITLE,
  queueEmptyBannerMessage,
  queueTableEmptyCopy
} from "@/lib/review/queue-empty-copy";

describe("queue empty copy", () => {
  it("keeps the global queue-empty banner when no chips are active", () => {
    expect(queueEmptyBannerMessage(false)).toBe(QUEUE_EMPTY_BANNER_GLOBAL);
    expect(queueEmptyBannerMessage(false)).toBe("Свободных обращений в очереди нет.");
  });

  it("scopes the banner to the current view when filters emptied take-next", () => {
    expect(queueEmptyBannerMessage(true)).toBe(QUEUE_EMPTY_BANNER_FILTERED);
    expect(queueEmptyBannerMessage(true)).toBe("В текущем представлении свободных кейсов нет.");
  });

  it("uses the import story only for a truly empty workspace table", () => {
    expect(queueTableEmptyCopy(false)).toEqual({
      title: QUEUE_TABLE_EMPTY_GLOBAL_TITLE,
      description: QUEUE_TABLE_EMPTY_GLOBAL_DESCRIPTION
    });
    expect(queueTableEmptyCopy(false).description).toContain("импорта");
  });

  it("does not claim the workspace is empty when chips emptied the table", () => {
    expect(queueTableEmptyCopy(true)).toEqual({
      title: QUEUE_TABLE_EMPTY_FILTERED_TITLE,
      description: QUEUE_TABLE_EMPTY_FILTERED_DESCRIPTION
    });
    expect(queueTableEmptyCopy(true).description).not.toContain("импорта");
  });
});
