import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { resolveReportPeriod } from "@/lib/report-period";

export const dynamic = "force-dynamic";

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

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const period = resolveReportPeriod(params);
  const reviews = await prisma.review.findMany({
    where: {
      workspaceId: user.workspaceId,
      status: "FINALIZED",
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
  const header = [
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
  const rows = reviews.map((review) => {
    const finding = review.findings[0];

    return csvRow([
      review.finalizedAt?.toLocaleString("ru-RU") ?? "",
      Math.round(review.totalScore),
      review.criticalError ? review.criticalCategory ?? "Да" : "Нет",
      review.needsReanswer ? review.reanswerStatus : "Нет",
      review.appealStatus,
      review.conversation.externalSource,
      review.conversation.externalId,
      review.conversation.subject,
      review.conversation.customerName,
      review.conversation.assigneeName,
      review.reviewer.name,
      review.conversation.supportLine,
      review.conversation.csatScore ?? review.conversation.csatBucket,
      finding?.category ?? "",
      finding?.riskLevel ?? "",
      review.summary
    ]);
  });
  const csv = [csvRow(header), ...rows].join("\n");

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quality-report-${period.start.toISOString().slice(0, 10)}-${period.end
        .toISOString()
        .slice(0, 10)}.csv"`
    }
  });
}
