"use server";

import { revalidatePath } from "next/cache";
import { isAiScoringProviderChoice } from "@/lib/ai-quality/scoring";
import { auditLog } from "@/lib/audit";
import { assertCanPersistSettings, requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

/**
 * Sets the workspace's AI scoring engine preference (auto | yandexgpt |
 * anthropic | openai | deterministic). Gated behind the same system-admin
 * permission as the other admin/system writes. Credentials still come from env
 * per provider; the deterministic fallback runs when the chosen provider has no
 * key.
 */
export async function saveAiScoringProvider(formData: FormData) {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  await assertCanPersistSettings(user);

  const raw = formData.get("provider");
  const provider = typeof raw === "string" ? raw.trim() : "";

  if (!isAiScoringProviderChoice(provider)) {
    throw new Error("Некорректный провайдер AI-оценки.");
  }

  await prisma.workspace.update({
    where: { id: user.workspaceId },
    data: { aiScoringProvider: provider }
  });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "ai_scoring.provider_updated",
    targetType: "workspace",
    targetId: user.workspaceId,
    metadata: { provider }
  });

  revalidatePath("/admin/system");
}
