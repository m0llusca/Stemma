import { describe, expect, it } from "vitest";
import { reportRowsToCsv, reportRowsToXlsx } from "@/lib/report-export";

const row = [
  "02.05.2026, 12:00:00",
  "94",
  "Нет",
  "Нет",
  "none",
  "otrs_family",
  "OTRS-2451",
  "Консультация по статусу заявления",
  "Анна Смирнова",
  "Ольга Иванова",
  "Проверяющий",
  "1ЛП",
  "5",
  "Полнота решения",
  "LOW",
  "Ответ корректный; следующий шаг понятен."
];

describe("report exports", () => {
  it("escapes CSV cells and keeps UTF-8 BOM", () => {
    const csv = reportRowsToCsv([row]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Ответ корректный; следующий шаг понятен."');
  });

  it("builds a minimal XLSX package with worksheet XML", () => {
    const xlsx = reportRowsToXlsx([row]);

    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
    expect(xlsx.toString("utf8")).toContain("xl/worksheets/sheet1.xml");
    expect(xlsx.toString("utf8")).toContain("Консультация по статусу заявления");
  });
});
