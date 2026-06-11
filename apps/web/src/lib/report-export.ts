import fs from "node:fs";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/db";
import { resolveReportPeriod, type ReportPeriod } from "@/lib/report-period";
import { formatQualityScore } from "@/lib/score-display";

export const reportExportColumns = [
  "Дата проверки",
  "Оценка",
  "Критическая ошибка",
  "Переответ",
  "Апелляция",
  "Источник",
  "Внешний ID",
  "Тема",
  "Клиент",
  "Оператор",
  "Проверяющий",
  "Линия",
  "CSAT",
  "Категория",
  "Риск",
  "Итог"
];

export type ReportExportRow = string[];

function csvCell(value: unknown) {
  if (value == null) {
    return "";
  }

  const stringValue = String(value);

  if (/[;"\n\r]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

function csvRow(values: unknown[]) {
  return values.map(csvCell).join(";");
}

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function columnName(index: number) {
  let name = "";
  let value = index + 1;

  while (value > 0) {
    const modulo = (value - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    value = Math.floor((value - modulo) / 26);
  }

  return name;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;

  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }

  return crc >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const crc = crc32(entry.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);

    localParts.push(localHeader, name, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function worksheetXml(rows: string[][]) {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

let cyrillicFontWarningLogged = false;

function fontPath() {
  const found = [
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/noto/NotoSans-Regular.ttf"
  ].find((path) => fs.existsSync(path));

  if (!found && !cyrillicFontWarningLogged) {
    cyrillicFontWarningLogged = true;
    console.warn(
      "Не найден TTF-шрифт с поддержкой кириллицы: кириллица в PDF-отчете может отображаться некорректно."
    );
  }

  return found;
}

export async function loadReportExportRows(workspaceId: string, rawParams: Record<string, string>) {
  const period = resolveReportPeriod(rawParams);
  const reviews = await prisma.review.findMany({
    where: {
      workspaceId,
      status: "FINALIZED",
      reviewSource: "HUMAN",
      finalizedAt: {
        gte: period.start,
        lte: period.end
      }
    },
    include: {
      conversation: true,
      reviewer: true,
      findings: {
        orderBy: {
          createdAt: "asc"
        }
      }
    },
    orderBy: {
      finalizedAt: "desc"
    }
  });
  const rows = reviews.map((review): ReportExportRow => {
    const finding = review.findings[0];

    return [
      review.finalizedAt?.toLocaleString("ru-RU") ?? "",
      formatQualityScore(review.totalScore),
      review.criticalError ? review.criticalCategory ?? "Да" : "Нет",
      review.needsReanswer ? review.reanswerStatus : "Нет",
      review.appealStatus,
      review.conversation.externalSource,
      review.conversation.externalId,
      review.conversation.subject,
      review.conversation.customerName,
      review.conversation.assigneeName ?? "",
      review.reviewer.name,
      review.conversation.supportLine ?? "",
      String(review.conversation.csatScore ?? review.conversation.csatBucket),
      finding?.category ?? "",
      finding?.riskLevel ?? "",
      review.summary
    ];
  });

  return { period, rows };
}

export function reportExportFilename(period: ReportPeriod, extension: string) {
  return `quality-report-${period.start.toISOString().slice(0, 10)}-${period.end.toISOString().slice(0, 10)}.${extension}`;
}

export function reportRowsToCsv(rows: ReportExportRow[]) {
  return `\uFEFF${[csvRow(reportExportColumns), ...rows.map(csvRow)].join("\n")}`;
}

export function reportRowsToXlsx(rows: ReportExportRow[]) {
  const allRows = [reportExportColumns, ...rows];

  return createZip([
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
      )
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
      )
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Контроль качества" sheetId="1" r:id="rId1"/></sheets></workbook>`
      )
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
      )
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: Buffer.from(worksheetXml(allRows))
    }
  ]);
}

export async function reportRowsToPdf(rows: ReportExportRow[], period: ReportPeriod) {
  const regularFont = fontPath();
  const doc = new PDFDocument({ margin: 36, size: "A4", font: regularFont });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  if (regularFont) {
    doc.registerFont("regular", regularFont);
    doc.font("regular");
  }

  doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  doc.fontSize(16).text("Отчет контроля качества", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`${period.start.toLocaleDateString("ru-RU")} - ${period.end.toLocaleDateString("ru-RU")}`);
  doc.moveDown();

  rows.slice(0, 80).forEach((row, index) => {
    const [date, score, critical, reanswer, appeal, source, externalId, subject, customer, assignee, reviewer, line, csat, category, risk, summary] = row;

    doc.fontSize(10).text(`${index + 1}. ${date} · ${score} · ${source}/${externalId}`);
    doc.fontSize(9).text(`${subject} · клиент: ${customer} · оператор: ${assignee} · проверяющий: ${reviewer}`);
    doc.fontSize(9).text(`Линия: ${line || "нет"} · CSAT: ${csat} · категория: ${category || "нет"} · риск: ${risk || "нет"}`);
    doc.fontSize(9).text(`Критическая: ${critical} · переответ: ${reanswer} · апелляция: ${appeal}`);
    doc.fontSize(9).text(summary || "Без итога");
    doc.moveDown(0.7);
  });

  if (rows.length > 80) {
    doc.fontSize(9).text(`В PDF включены первые 80 строк из ${rows.length}. Полный набор используйте в XLSX/CSV.`);
  }

  doc.end();
  return done;
}
