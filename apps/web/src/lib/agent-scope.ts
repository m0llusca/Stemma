/**
 * Shared assigneeId scope helpers for SUPPORT_AGENT confidentiality.
 * Never authorize by assigneeName — display names are not unique.
 */

export function agentConversationWhere(user: { id: string; role: string }): { assigneeId: string } | Record<string, never> {
  if (user.role === "SUPPORT_AGENT") {
    return { assigneeId: user.id };
  }
  return {};
}

export function assertAgentOwnsAssignee(
  user: { id: string; role: string },
  resource: { assigneeId: string | null }
): void {
  if (user.role !== "SUPPORT_AGENT") {
    return;
  }

  if (resource.assigneeId === null || resource.assigneeId !== user.id) {
    throw new Error("Нет доступа к чужому обращению.");
  }
}
