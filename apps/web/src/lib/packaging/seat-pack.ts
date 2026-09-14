/**
 * Seat / workspace packaging sketch (no payment stack).
 * Maps roles → seat kinds and soft AI draft quotas for the first paid pilot.
 * Defaults: seats-by-role until volume-based billing is proven.
 */

export type SeatKind = "admin" | "qa_reviewer" | "team_lead" | "support_agent" | "exec_viewer";

export type WorkspaceSeatPack = {
  /** Soft caps — enforcement is advisory until billing lands. */
  seats: Record<SeatKind, number>;
  /** Max AI score drafts per workspace per calendar month. */
  aiDraftQuotaPerMonth: number;
  /** Included connector sources before “deepen connector” upsell. */
  includedCertifiedSources: number;
};

export const defaultPilotSeatPack: WorkspaceSeatPack = {
  seats: {
    admin: 2,
    qa_reviewer: 10,
    team_lead: 3,
    support_agent: 50,
    exec_viewer: 5
  },
  aiDraftQuotaPerMonth: 2_000,
  includedCertifiedSources: 2
};

export function seatKindForRole(role: string): SeatKind | null {
  switch (role) {
    case "ADMIN":
      return "admin";
    case "QA_ANALYST":
      return "qa_reviewer";
    case "TEAM_LEAD":
      return "team_lead";
    case "SUPPORT_AGENT":
      return "support_agent";
    case "EXEC":
    case "VIEWER":
      return "exec_viewer";
    default:
      return null;
  }
}

export function summarizeSeatUsage(input: {
  pack: WorkspaceSeatPack;
  roleCounts: Partial<Record<string, number>>;
  aiDraftsThisMonth: number;
  certifiedSources: number;
}) {
  const byKind: Record<SeatKind, { used: number; cap: number }> = {
    admin: { used: 0, cap: input.pack.seats.admin },
    qa_reviewer: { used: 0, cap: input.pack.seats.qa_reviewer },
    team_lead: { used: 0, cap: input.pack.seats.team_lead },
    support_agent: { used: 0, cap: input.pack.seats.support_agent },
    exec_viewer: { used: 0, cap: input.pack.seats.exec_viewer }
  };

  for (const [role, count] of Object.entries(input.roleCounts)) {
    const kind = seatKindForRole(role);
    if (!kind || !count) continue;
    byKind[kind].used += count;
  }

  return {
    seats: byKind,
    aiDrafts: {
      used: input.aiDraftsThisMonth,
      cap: input.pack.aiDraftQuotaPerMonth,
      overQuota: input.aiDraftsThisMonth > input.pack.aiDraftQuotaPerMonth
    },
    sources: {
      certified: input.certifiedSources,
      included: input.pack.includedCertifiedSources,
      overIncluded: input.certifiedSources > input.pack.includedCertifiedSources
    }
  };
}
