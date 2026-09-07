import type { RoleName } from "@prisma/client";
import { roleHomePath } from "@/lib/auth/role-home";
import { TAKE_NEXT_LABEL } from "@/lib/review/take-next-copy";

/**
 * Impostor list filter — looks like Take next, is not. Empty triage must never
 * land here while copy says «возьмите следующий».
 */
export const EMPTY_TRIAGE_IMPOSTOR_HREF = "/reviews?status=unreviewed";

export type EmptyTriagePrimary =
  | {
      kind: "take-next";
      label: typeof TAKE_NEXT_LABEL;
      description: string;
    }
  | {
      kind: "href";
      href: string;
      label: string;
      description: string;
    };

const takeNextDescription = "Держите ритм очереди — возьмите следующий разговор в проверку.";

/**
 * Empty-triage primary when there is no overdue / risk / training focus.
 * Lead/admin: real Take next (same `takeNextReview` path as the queue).
 * Analyst: role home (Мои+просрочено) — not a generic unreviewed filter that
 * drops inbox chips, and not a Take-next label on a list href.
 */
export function emptyTriagePrimary(role: RoleName, options?: { name?: string }): EmptyTriagePrimary {
  if (role === "QA_ANALYST") {
    return {
      kind: "href",
      href: roleHomePath(role, { name: options?.name }),
      label: "Открыть сегодня",
      description: "Критичных отклонений нет — откройте очередь дня."
    };
  }

  return {
    kind: "take-next",
    label: TAKE_NEXT_LABEL,
    description: takeNextDescription
  };
}
