import { AlertTriangle, CheckCircle2, ClipboardList, Database } from "lucide-react";
import { MetricCard } from "@/components/reports/metric-card";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatAverageScore(value: number | null | undefined) {
  if (value == null) {
    return "N/A";
  }

  return `${Math.round(value)}%`;
}

export default async function ReportsPage() {
  const user = await getCurrentUser();

  const [scoreAggregate, highRiskFindings, coachingBacklog, reviewedSources] = await Promise.all([
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
    prisma.conversation.groupBy({
      by: ["externalSource"],
      where: {
        workspaceId: user.workspaceId,
        reviews: {
          some: {
            status: "FINALIZED"
          }
        }
      }
    })
  ]);

  return (
    <section className="px-8 py-7">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#667085]">Quality reporting</p>
        <h1 className="mt-1 text-2xl font-semibold">Reports</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Average score"
          value={formatAverageScore(scoreAggregate._avg.totalScore)}
          helper="Finalized reviews in the current workspace."
          icon={<CheckCircle2 size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="High-risk findings"
          value={String(highRiskFindings)}
          helper="Finalized findings marked high or critical."
          icon={<AlertTriangle size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Coaching backlog"
          value={String(coachingBacklog)}
          helper="Open coaching actions linked to QA findings."
          icon={<ClipboardList size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Reviewed sources"
          value={String(reviewedSources.length)}
          helper="Distinct source systems with finalized reviews."
          icon={<Database size={18} aria-hidden="true" />}
        />
      </div>
    </section>
  );
}
