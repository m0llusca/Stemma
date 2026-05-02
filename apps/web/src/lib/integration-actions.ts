"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberField(formData: FormData, key: string, fallback: number) {
  const parsed = Number(stringField(formData, key));

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function recordIntegrationDryRun(formData: FormData) {
  const user = await getCurrentUser();
  const source = stringField(formData, "source") || "unknown";
  const sourceLabel = stringField(formData, "sourceLabel") || source;
  const mode = stringField(formData, "mode") || "unknown";
  const baseUrl = stringField(formData, "baseUrl");
  const maxTickets = numberField(formData, "maxTickets", 100);
  const batchSize = numberField(formData, "batchSize", 25);
  const dateRangeDays = numberField(formData, "dateRangeDays", 30);

  await prisma.$transaction(async (tx) => {
    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "integration.dry_run_checked",
        targetType: "integration",
        targetId: source,
        metadata: {
          source,
          sourceLabel,
          mode,
          baseUrl,
          dryRun: true,
          maxTickets,
          batchSize,
          dateRangeDays,
          estimatedCount: Math.min(maxTickets, batchSize)
        }
      },
      tx
    );
  });

  revalidatePath("/admin/integrations");
}
