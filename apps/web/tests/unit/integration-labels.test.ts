import { describe, expect, it } from "vitest";
import {
  formatArticleCount,
  formatAttachmentCount,
  integrationModeLabel,
  integrationRunItemStatusLabel
} from "@/lib/integrations/labels";

describe("integrationModeLabel", () => {
  it("maps known run modes to Russian labels", () => {
    expect(integrationModeLabel("preview")).toBe("Предпросмотр");
    expect(integrationModeLabel("dry_run")).toBe("Проверка без импорта");
    expect(integrationModeLabel("import")).toBe("Импорт");
    expect(integrationModeLabel("selected_import")).toBe("Выборочный импорт");
    expect(integrationModeLabel("manual_ticket_ids")).toBe("Ручные TicketID");
    expect(integrationModeLabel("ticket_search")).toBe("Поиск тикетов");
  });

  it("falls back to the raw value for unknown modes", () => {
    expect(integrationModeLabel("custom_mode")).toBe("custom_mode");
  });
});

describe("integrationRunItemStatusLabel", () => {
  it("maps known item statuses to Russian labels", () => {
    expect(integrationRunItemStatusLabel("previewed")).toBe("Предпросмотр");
    expect(integrationRunItemStatusLabel("queued")).toBe("В очереди");
    expect(integrationRunItemStatusLabel("imported")).toBe("Импортировано");
    expect(integrationRunItemStatusLabel("failed")).toBe("Ошибка");
  });

  it("falls back to the raw value for unknown statuses", () => {
    expect(integrationRunItemStatusLabel("mystery")).toBe("mystery");
  });
});

describe("formatArticleCount", () => {
  it("pluralizes Russian article forms", () => {
    expect(formatArticleCount(1)).toBe("1 статья");
    expect(formatArticleCount(3)).toBe("3 статьи");
    expect(formatArticleCount(5)).toBe("5 статей");
    expect(formatArticleCount(21)).toBe("21 статья");
  });
});

describe("formatAttachmentCount", () => {
  it("pluralizes Russian attachment forms", () => {
    expect(formatAttachmentCount(1)).toBe("1 файл");
    expect(formatAttachmentCount(2)).toBe("2 файла");
    expect(formatAttachmentCount(5)).toBe("5 файлов");
  });
});
