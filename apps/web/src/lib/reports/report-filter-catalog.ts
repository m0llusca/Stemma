import type {
  ReportFilterCatalog,
  ReportFilterOption
} from "@/lib/reports/report-analysis-state";
import { buildReportCatalogSlug } from "@/lib/reports/report-filter-slug";

function catalogOption(value: string): ReportFilterOption {
  const normalized = value.trim().normalize("NFKC");
  return {
    slug: buildReportCatalogSlug(normalized),
    value: normalized
  };
}

function distinctValues(values: readonly (string | null | undefined)[]) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
    .sort((left, right) => left.localeCompare(right, "ru-RU"));
}

export function buildReportFilterCatalog(input: {
  teams: readonly (string | null | undefined)[];
  sources: readonly (string | null | undefined)[];
  blocks: readonly (string | null | undefined)[];
}): ReportFilterCatalog {
  return {
    teams: distinctValues(input.teams).map(catalogOption),
    sources: distinctValues(input.sources),
    blocks: distinctValues(input.blocks).map(catalogOption)
  };
}

export async function loadReportFilterCatalog(workspaceId: string) {
  const { prisma } = await import("@/lib/db");
  const [teams, sources, blocks] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        workspaceId,
        teamName: { not: null }
      },
      distinct: ["teamName"],
      select: { teamName: true }
    }),
    prisma.conversation.findMany({
      where: { workspaceId },
      distinct: ["externalSource"],
      select: { externalSource: true }
    }),
    prisma.scorecardCriterion.findMany({
      where: {
        scorecard: {
          workspaceId,
          isActive: true
        }
      },
      distinct: ["block"],
      select: { block: true }
    })
  ]);

  return buildReportFilterCatalog({
    teams: teams.map((item) => item.teamName),
    sources: sources.map((item) => item.externalSource),
    blocks: blocks.map((item) => item.block)
  });
}
