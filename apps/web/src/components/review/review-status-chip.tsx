import type { QaStatus } from "@prisma/client";
import { Chip } from "@/components/ui/chip";
import { resolveQueueStatusChip } from "@/lib/review-state";

export type ReviewStatusChipConversation = {
  qaStatus: QaStatus;
  pendingReopen?: unknown;
  reviews: Array<{ status: string; reviewSource: string }>;
};

/**
 * Single status chip for queue rows and next-case preview.
 * Label and tone come from resolveQueueStatusChip — not a second qaStatus dictionary.
 */
export function ReviewStatusChip({ conversation }: { conversation: ReviewStatusChipConversation }) {
  const chip = resolveQueueStatusChip(conversation);

  return <Chip tone={chip.tone}>{chip.label}</Chip>;
}
