import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type PageSkeletonVariant = "admin" | "dashboard" | "detail" | "reports" | "workspace";

type PageSkeletonProps = {
  label?: string;
  variant?: PageSkeletonVariant;
};

function Shell({
  label,
  children,
  className
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[var(--content-max-width,1420px)] flex-col gap-6 p-4 md:p-6",
        className
      )}
      aria-busy="true"
      aria-label={label}
    >
      {children}
    </div>
  );
}

function HeaderSkeleton({
  titleWidth = "w-56",
  subtitleWidth = "w-full max-w-md",
  actionWidth = "w-36"
}: {
  titleWidth?: string;
  subtitleWidth?: string;
  actionWidth?: string;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className={cn("h-8", titleWidth)} />
        <Skeleton className={cn("h-4", subtitleWidth)} />
      </div>
      <Skeleton className={cn("h-9 shrink-0", actionWidth)} />
    </header>
  );
}

function MetricSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-24" />
      ))}
    </div>
  );
}

function SkeletonRows({ rows = 5, className = "h-14" }: { rows?: number; className?: string }) {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={cn("w-full", className)} />
      ))}
    </div>
  );
}

function PanelCard({
  children,
  className,
  headerWidth = "w-40"
}: {
  children: ReactNode;
  className?: string;
  headerWidth?: string;
}) {
  return (
    <Card className={className} aria-hidden="true">
      <CardHeader className="pb-0">
        <Skeleton className={cn("h-4", headerWidth)} />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function PageSkeleton({ label = "Loading page", variant = "workspace" }: PageSkeletonProps) {
  if (variant === "dashboard") {
    return (
      <Shell label={label}>
        <HeaderSkeleton titleWidth="w-44" actionWidth="w-40" />

        <Skeleton className="h-16 w-full" />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent>
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" aria-hidden="true">
          <PanelCard headerWidth="w-36">
            <SkeletonRows rows={3} className="h-14" />
          </PanelCard>
          <PanelCard headerWidth="w-48">
            <Skeleton className="h-40 w-full" />
          </PanelCard>
        </section>
      </Shell>
    );
  }

  if (variant === "reports") {
    return (
      <Shell label={label}>
        <HeaderSkeleton titleWidth="w-60" actionWidth="w-28" />

        <nav className="flex flex-wrap gap-2" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-24" />
          ))}
        </nav>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end" aria-hidden="true">
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-36 shrink-0" />
        </div>

        <Skeleton className="h-16 w-full" />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} size="sm">
              <CardContent>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <PanelCard headerWidth="w-48">
          <Skeleton className="h-52 w-full" />
        </PanelCard>

        <PanelCard headerWidth="w-44">
          <SkeletonRows rows={5} className="h-12" />
        </PanelCard>
      </Shell>
    );
  }

  if (variant === "admin") {
    return (
      <Shell label={label}>
        <HeaderSkeleton titleWidth="w-52" actionWidth="w-48" />

        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]" aria-hidden="true">
          <Card className="h-fit">
            <CardContent className="flex flex-col gap-4">
              <Skeleton className="h-9 w-full" />
              {Array.from({ length: 3 }).map((_, group) => (
                <div key={group} className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-20" />
                  {Array.from({ length: 3 }).map((_, item) => (
                    <Skeleton key={item} className="h-8 w-full" />
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex min-w-0 flex-col gap-4">
            <Skeleton className="h-16 w-full" />
            <PanelCard headerWidth="w-44">
              <SkeletonRows rows={9} className="h-11" />
            </PanelCard>
          </div>
        </div>
      </Shell>
    );
  }

  if (variant === "detail") {
    return (
      <Shell label={label}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-80 max-w-full" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <MetricSkeletons count={3} />
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <PanelCard headerWidth="w-40">
            <SkeletonRows rows={7} className="h-16" />
          </PanelCard>
          <PanelCard headerWidth="w-36">
            <SkeletonRows rows={5} className="h-16" />
          </PanelCard>
        </div>
      </Shell>
    );
  }

  // workspace — reviews queue, coaching, calibration, self-review
  return (
    <Shell label={label}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </div>
        <MetricSkeletons count={4} />
      </div>

      <Card aria-hidden="true">
        <CardContent className="flex flex-wrap gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 min-w-[140px] flex-1" />
          ))}
        </CardContent>
      </Card>

      <PanelCard headerWidth="w-36">
        <SkeletonRows rows={8} className="h-14" />
      </PanelCard>
    </Shell>
  );
}
