import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { adminLoadingLabel } from "@/lib/admin-sections";

export default function AdminLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[var(--content-max-width,1420px)] flex-col gap-6 p-4 md:p-6"
      aria-busy="true"
      aria-label={adminLoadingLabel("/admin")}
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <Skeleton className="h-9 w-48 shrink-0" />
      </header>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]" aria-hidden="true">
        <Card className="h-fit">
          <CardContent className="flex flex-col gap-4 pt-(--card-spacing)">
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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={index}>
                <CardContent className="flex flex-col gap-3 pt-(--card-spacing)">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-28" />
                  <Skeleton className="h-3 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader className="pb-0">
              <Skeleton className="h-4 w-44" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
