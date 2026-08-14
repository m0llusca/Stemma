import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SemanticTone } from "@/lib/ui/semantic-status";

const toneClass: Record<SemanticTone, string> = {
  positive: "border-emerald-500/30 bg-emerald-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  negative: "border-destructive/30 bg-destructive/5",
  neutral: "",
  info: "border-primary/30 bg-primary/5"
};

export function PriorityActionPanel({
  title,
  description,
  actionLabel,
  href,
  tone = "info"
}: {
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  tone?: SemanticTone;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col items-stretch gap-4 py-(--card-spacing) sm:flex-row sm:items-center sm:justify-between",
        toneClass[tone]
      )}
    >
      <CardHeader className="min-w-0 flex-1 gap-1.5 py-0">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="text-sm">{description}</CardDescription>
      </CardHeader>
      <div className="flex shrink-0 items-center px-(--card-spacing) sm:pl-0">
        <Link
          href={href}
          className={cn(buttonVariants(), "w-full gap-1.5 sm:w-auto")}
        >
          <span>{actionLabel}</span>
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
