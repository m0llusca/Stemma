import type { ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/**
 * Domain empty-state wrapper over shadcn Empty.
 * Keeps the product API (icon/title/description/action) while rendering only shadcn primitives.
 */
export type EmptyStateSize = "inline" | "block";

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "block",
  className
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  size?: EmptyStateSize;
  className?: string;
}) {
  return (
    <Empty className={cn(size === "inline" ? "min-h-0 border-0 py-6" : "py-12", className)}>
      <EmptyHeader>
        {icon != null ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description != null ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action != null ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
