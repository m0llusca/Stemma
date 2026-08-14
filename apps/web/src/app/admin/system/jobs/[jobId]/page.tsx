import { ArrowLeft, Ban, Braces, ListChecks, Play } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { StatKpi } from "@/components/ui/stat-kpi";
import { PageShell } from "@/components/ui/page-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { AdminFrame } from "@/components/admin/admin-frame";
import { adminEyebrow } from "@/lib/admin-sections";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { backendJobStatusView, backendJobTypeLabel, queueNameLabel } from "@/lib/operational-status";
import { cancelQueuedBackendJob, runQueuedBackendJobs } from "@/lib/system-actions";

export const dynamic = "force-dynamic";

type JobDetailsPageProps = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type JobDetailsSection = "summary" | "events" | "payload" | "result";

const jobDetailsSections: Array<{ value: JobDetailsSection; label: string }> = [
  { value: "summary", label: "Сводка" },
  { value: "events", label: "События" },
  { value: "payload", label: "Payload" },
  { value: "result", label: "Результат" }
];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function jobDetailsSectionParam(value: string | string[] | undefined): JobDetailsSection {
  const section = firstParam(value);

  return jobDetailsSections.some((item) => item.value === section) ? (section as JobDetailsSection) : "summary";
}

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleString("ru-RU") : "Нет данных";
}

function parseJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value || "{}";
  }
}

/** Пустая строка, `null`, `{}` или `[]` — показывать нечего, вместо голого JSON выводим EmptyState. */
function isEmptyJson(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return true;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed == null) {
      return true;
    }

    return typeof parsed === "object" && Object.keys(parsed as object).length === 0;
  } catch {
    return false;
  }
}

export default function JobDetailsPage({ params, searchParams }: JobDetailsPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label="Загрузка: Детали задачи" />}>
      <JobDetailsPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function JobDetailsPageContent({ params, searchParams }: JobDetailsPageProps) {
  const search = await searchParams;
  const activeSection = jobDetailsSectionParam(search.section);
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  const { jobId } = await params;
  const jobDetailsSectionHref = (section: JobDetailsSection) => `/admin/system/jobs/${jobId}?section=${section}`;
  const job = await prisma.backendJob.findFirst({
    where: {
      id: jobId,
      workspaceId: user.workspaceId
    },
    include: {
      createdBy: {
        select: {
          name: true,
          email: true
        }
      },
      events: {
        orderBy: [{ createdAt: "asc" }]
      }
    }
  });

  if (!job) {
    notFound();
  }

  const jobStatus = backendJobStatusView(job.status);

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title={backendJobTypeLabel(job.type)}
      description={`Создано ${formatDate(job.createdAt)}.`}
      actions={
        <>
          <Button render={<Link href="/admin/system" />} nativeButton={false} variant="outline" size="sm">
            <ArrowLeft data-icon="inline-start" aria-hidden="true" />
            К системе
          </Button>
          {job.status === "QUEUED" ? (
            <form action={cancelQueuedBackendJob}>
              <input type="hidden" name="jobId" value={job.id} />
              <Button type="submit" variant="outline" size="sm">
                <Ban data-icon="inline-start" aria-hidden="true" />
                Отменить
              </Button>
            </form>
          ) : null}
          <form action={runQueuedBackendJobs}>
            <input type="hidden" name="limit" value="1" />
            <Button type="submit" size="sm">
              <Play data-icon="inline-start" aria-hidden="true" />
              Запустить очередь
            </Button>
          </form>
        </>
      }
      tabs={jobDetailsSections.map((section) => ({
        href: jobDetailsSectionHref(section.value),
        label: section.label,
        active: activeSection === section.value,
        count: section.value === "events" ? job.events.length : undefined
      }))}
    >
      <AdminFrame>
        <div className="flex flex-col gap-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Сводка фоновой задачи">
            <StatKpi label="Статус" value={jobStatus.label} hint={`Попытка ${job.attempts}/${job.maxAttempts}`} />
            <StatKpi label="Очередь" value={queueNameLabel(job.queueName)} hint={`Запуск: ${formatDate(job.runAfter)}`} />
            <StatKpi label="События" value={job.events.length} hint="История runner" />
          </section>

          {activeSection === "summary" ? (
            <Card aria-labelledby="job-summary-title">
              <CardHeader className="border-b">
                <CardTitle id="job-summary-title">Сводка</CardTitle>
                <CardDescription>Ключевые параметры фоновой задачи без технического JSON.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">ID задачи</span>
                    <p className="break-all font-mono text-sm text-foreground">{job.id}</p>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Метаданные</span>
                    <p className="text-sm text-muted-foreground">Создал: {job.createdBy?.name ?? "Автоматика"}</p>
                    <p className="text-sm tabular-nums text-muted-foreground">Старт: {formatDate(job.startedAt)}</p>
                    <p className="text-sm tabular-nums text-muted-foreground">Финиш: {formatDate(job.finishedAt)}</p>
                  </div>
                </div>
                {job.errorMessage ? (
                  <Alert variant="destructive">
                    <Ban aria-hidden="true" />
                    <AlertTitle>Ошибка</AlertTitle>
                    <AlertDescription>{job.errorMessage}</AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {activeSection === "events" ? (
            <Card aria-labelledby="job-events-title">
              <CardHeader className="border-b">
                <CardTitle id="job-events-title">События</CardTitle>
                <CardDescription>История запуска, ошибок и результатов backend runner.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {job.events.length === 0 ? (
                  <EmptyState
                    size="inline"
                    icon={<ListChecks size={20} aria-hidden="true" />}
                    title="Событий пока нет"
                    description="История runner появится после запуска задачи."
                  />
                ) : (
                  <Table aria-labelledby="job-events-title">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Сообщение</TableHead>
                        <TableHead>Уровень</TableHead>
                        <TableHead>Время</TableHead>
                        <TableHead>Метаданные</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {job.events.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="max-w-[320px] whitespace-normal font-medium text-foreground">
                            {event.message}
                          </TableCell>
                          <TableCell>
                            <Chip tone="neutral" size="xs">
                              {event.level}
                            </Chip>
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">{formatDate(event.createdAt)}</TableCell>
                          <TableCell className="max-w-[280px]">
                            <Collapsible>
                              <CollapsibleTrigger className="cursor-pointer text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                Метаданные
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <pre className="mt-2 max-h-[220px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-5 text-foreground">
                                  {parseJson(event.metadata)}
                                </pre>
                              </CollapsibleContent>
                            </Collapsible>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

          {activeSection === "payload" ? (
            <Card aria-labelledby="job-payload-title">
              <CardHeader className="border-b">
                <CardTitle id="job-payload-title">Payload задачи</CardTitle>
                <CardDescription>Техническое тело задачи для отладки обработчика.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {isEmptyJson(job.payloadJson) ? (
                  <EmptyState
                    size="inline"
                    icon={<Braces size={20} aria-hidden="true" />}
                    title="Полезная нагрузка отсутствует"
                    description="Задача создана без параметров — обработчику не передавались данные."
                  />
                ) : (
                  <pre className="max-h-[520px] overflow-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-5 text-foreground">
                    {parseJson(job.payloadJson)}
                  </pre>
                )}
              </CardContent>
            </Card>
          ) : null}

          {activeSection === "result" ? (
            <Card aria-labelledby="job-result-title">
              <CardHeader className="border-b">
                <CardTitle id="job-result-title">Результат</CardTitle>
                <CardDescription>Ответ обработчика после выполнения задачи.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {isEmptyJson(job.resultJson) ? (
                  <EmptyState
                    size="inline"
                    icon={<Braces size={20} aria-hidden="true" />}
                    title="Задача не вернула результат"
                    description="Ответ обработчика появится после успешного выполнения задачи."
                  />
                ) : (
                  <pre className="max-h-[520px] overflow-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-5 text-foreground">
                    {parseJson(job.resultJson)}
                  </pre>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </AdminFrame>
    </PageShell>
  );
}
