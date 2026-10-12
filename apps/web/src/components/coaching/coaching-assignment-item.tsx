import type { ReactNode } from "react";
import { Chip } from "@/components/ui/chip";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

type CoachingAssignmentItemProps = {
  title: string;
  description: string;
  assigneeName: string;
  dueLabel: string;
  overdue: boolean;
  dueThisWeek: boolean;
  isPriority: boolean;
  status: ReactNode;
  context: ReactNode;
  actions: ReactNode;
};

export function CoachingAssignmentItem({
  title, description, assigneeName, dueLabel, overdue, dueThisWeek, isPriority, status, context, actions
}: CoachingAssignmentItemProps) {
  return (
    <Item
      role="listitem"
      variant="outline"
      className={cn("items-start", overdue && "bg-destructive/5", isPriority && !overdue && "bg-primary/5")}
      data-state={isPriority ? "selected" : undefined}
    >
      <ItemContent className="min-w-0">
        <ItemTitle className="flex-wrap">
          {title}
          {isPriority ? <Chip tone="accent">Следующий</Chip> : null}
        </ItemTitle>
        <ItemDescription>{description}</ItemDescription>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <UserAvatar name={assigneeName} className="size-6" />
            {assigneeName}
          </span>
          <span className={cn(overdue && "font-medium text-destructive", dueThisWeek && !overdue && "font-medium text-primary")}>
            {dueLabel}
          </span>
          {status}
        </div>
        <div className="flex flex-wrap gap-1.5">{context}</div>
      </ItemContent>
      <ItemActions className="flex-wrap">{actions}</ItemActions>
    </Item>
  );
}
