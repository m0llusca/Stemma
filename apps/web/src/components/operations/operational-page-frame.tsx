import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Operations layout shell (PageShell-like stacking) composed with shadcn
 * spacing primitives. Keeps the signals → action → details → evidence order.
 */
export function OperationalPageFrame({
  title,
  signals,
  action,
  details,
  evidence,
  className
}: {
  title: string;
  signals?: ReactNode;
  action: ReactNode;
  details: ReactNode;
  evidence?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("flex min-w-0 flex-col gap-4 md:gap-5", className)}
      aria-label={title}
    >
      {signals ? <div className="flex min-w-0 flex-col gap-4">{signals}</div> : null}
      <div className="min-w-0">{action}</div>
      <Separator />
      <div className="flex min-w-0 flex-col gap-4">{details}</div>
      {evidence ? (
        <>
          <Separator />
          <div className="flex min-w-0 flex-col gap-4">{evidence}</div>
        </>
      ) : null}
    </section>
  );
}
