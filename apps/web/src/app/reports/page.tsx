import { AlertTriangle, CheckCircle2, ClipboardList, Database } from "lucide-react";
import { MetricCard } from "@/components/reports/metric-card";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { riskLevelLabels } from "@/lib/labels";

export const dynamic = "force-dynamic";

type BreakdownRow = {
  label: string;
  count: number;
  averageScore?: number | null;
};

function formatAverageScore(value: number | null | undefined) {
  if (value == null) {
    return "Нет данных";
  }

  return `${Math.round(value)}%`;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function addScoreGroup(groups: Map<string, number[]>, label: string, score: number) {
  const scores = groups.get(label) ?? [];
  scores.push(score);
  groups.set(label, scores);
}

function addCountGroup(groups: Map<string, number>, label: string) {
  groups.set(label, (groups.get(label) ?? 0) + 1);
}

function scoreGroupRows(groups: Map<string, number[]>): BreakdownRow[] {
  return Array.from(groups.entries())
    .map(([label, scores]) => ({
      label,
      count: scores.length,
      averageScore: average(scores)
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ru"));
}

function countGroupRows(groups: Map<string, number>): BreakdownRow[] {
  return Array.from(groups.entries())
    .map(([label, count]) => ({
      label,
      count
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ru"));
}

function BreakdownTable({
  title,
  rows,
  countLabel,
  showAverage = false
}: {
  title: string;
  rows: BreakdownRow[];
  countLabel: string;
  showAverage?: boolean;
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[#d7dce5] px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
          <tr>
            <th className="px-5 py-3 font-semibold">Разрез</th>
            <th className="px-5 py-3 font-semibold">{countLabel}</th>
            {showAverage ? <th className="px-5 py-3 font-semibold">Средняя оценка</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#d7dce5]">
          {rows.length > 0 ? (
            rows.map((row) => (
              <tr key={row.label}>
                <td className="px-5 py-4 font-medium text-[#17202a]">{row.label}</td>
                <td className="px-5 py-4 text-[#344054]">{row.count}</td>
                {showAverage ? (
                  <td className="px-5 py-4 text-[#344054]">{formatAverageScore(row.averageScore)}</td>
                ) : null}
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-5 py-4 text-[#667085]" colSpan={showAverage ? 3 : 2}>
                Нет завершенных проверок.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

export default async function ReportsPage() {
  const user = await getCurrentUser();

  const [scoreAggregate, highRiskFindings, coachingBacklog, finalizedReviews] = await Promise.all([
    prisma.review.aggregate({
      where: {
        workspaceId: user.workspaceId,
        status: "FINALIZED"
      },
      _avg: {
        totalScore: true
      }
    }),
    prisma.finding.count({
      where: {
        riskLevel: {
          in: ["HIGH", "CRITICAL"]
        },
        review: {
          workspaceId: user.workspaceId,
          status: "FINALIZED"
        }
      }
    }),
    prisma.coachingAction.count({
      where: {
        status: "open",
        finding: {
          review: {
            workspaceId: user.workspaceId
          }
        }
      }
    }),
    prisma.review.findMany({
      where: {
        workspaceId: user.workspaceId,
        status: "FINALIZED"
      },
      select: {
        totalScore: true,
        conversation: {
          select: {
            externalSource: true,
            assigneeName: true
          }
        },
        findings: {
          select: {
            category: true,
            riskLevel: true
          }
        }
      }
    })
  ]);
  const sourceGroups = new Map<string, number[]>();
  const assigneeGroups = new Map<string, number[]>();
  const categoryGroups = new Map<string, number>();
  const riskGroups = new Map<string, number>();

  for (const review of finalizedReviews) {
    addScoreGroup(sourceGroups, review.conversation.externalSource, review.totalScore);
    addScoreGroup(assigneeGroups, review.conversation.assigneeName ?? "Не назначен", review.totalScore);

    for (const finding of review.findings) {
      addCountGroup(categoryGroups, finding.category);
      addCountGroup(riskGroups, riskLevelLabels[finding.riskLevel]);
    }
  }

  const sourceRows = scoreGroupRows(sourceGroups);
  const assigneeRows = scoreGroupRows(assigneeGroups);
  const categoryRows = countGroupRows(categoryGroups);
  const riskRows = countGroupRows(riskGroups);

  return (
    <section className="px-8 py-7">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#667085]">Отчетность по качеству</p>
        <h1 className="mt-1 text-2xl font-semibold">Отчеты</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Средняя оценка"
          value={formatAverageScore(scoreAggregate._avg.totalScore)}
          helper="Завершенные проверки в текущем рабочем пространстве."
          icon={<CheckCircle2 size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Высокорисковые находки"
          value={String(highRiskFindings)}
          helper="Находки с высоким или критическим риском."
          icon={<AlertTriangle size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Очередь коучинга"
          value={String(coachingBacklog)}
          helper="Открытые действия по коучингу из QA-находок."
          icon={<ClipboardList size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Проверенные источники"
          value={String(sourceRows.length)}
          helper="Источник считается проверенным после финальной оценки."
          icon={<Database size={18} aria-hidden="true" />}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <BreakdownTable title="По источникам" rows={sourceRows} countLabel="Проверок" showAverage />
        <BreakdownTable title="По операторам" rows={assigneeRows} countLabel="Проверок" showAverage />
        <BreakdownTable title="По уровню риска" rows={riskRows} countLabel="Находок" />
        <BreakdownTable title="По категориям находок" rows={categoryRows} countLabel="Находок" />
      </div>
    </section>
  );
}
