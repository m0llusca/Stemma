import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { backendJobStatusView, integrationRunStatusView } from "@/lib/operational-status";
import {
  formatArticleCount,
  formatAttachmentCount,
  integrationModeLabel,
  integrationRunItemStatusLabel
} from "@/lib/integrations/labels";
import { russianPlural } from "@/lib/reports/report-format";
import { cn } from "@/lib/utils";

function runBadgeClass(tone: "ok" | "warn" | "error" | "neutral") {
  if (tone === "ok") {
    return "border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
  }
  if (tone === "warn") {
    return "border-transparent bg-amber-500/15 text-amber-900 dark:text-amber-300";
  }
  if (tone === "error") {
    return "border-transparent bg-destructive/15 text-destructive";
  }
  return "";
}

type BackendJobSummary = {
  id: string;
  status: string;
  createdAt: Date;
  runAfter: Date;
  attempts: number;
  maxAttempts: number;
};

type RunItem = {
  id: string;
  externalId: string;
  ticketNumber: string | null;
  status: string;
  articleCount: number;
  privateArticleCount: number;
  attachmentCount: number;
  conversationId: string | null;
  conversation: {
    id: string;
    subject: string;
  } | null;
};

type IntegrationRun = {
  id: string;
  status: string;
  mode: string;
  dryRun: boolean;
  requestedLimit: number;
  importedCount: number;
  errorCount: number;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  items: RunItem[];
  actor: {
    name: string;
  } | null;
};

type OtrsRunHistoryProps = {
  runs: IntegrationRun[];
  jobsByRunId: Map<string, BackendJobSummary>;
};

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleString("ru-RU") : "Нет данных";
}

export function OtrsRunHistory({ runs, jobsByRunId }: OtrsRunHistoryProps) {
  return (
    <Card className="overflow-clip">
      <CardHeader className="border-b">
        <h2 className="font-heading text-base leading-snug font-medium">
          История запусков
        </h2>
        <CardDescription>Предпросмотр, выборочные импорты и связанные backend-задачи.</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4 pt-(--card-spacing)">
        {runs.length === 0 ? (
          <Alert>
            <AlertDescription>Запусков для этого источника пока нет.</AlertDescription>
          </Alert>
        ) : (
          runs.map((run) => {
            const runStatus = integrationRunStatusView(run.status);
            const job = jobsByRunId.get(run.id);
            const jobStatus = job ? backendJobStatusView(job.status) : null;

            return (
              <Card key={run.id} size="sm" className="overflow-clip">
                <CardContent className="grid gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{run.dryRun ? "Предпросмотр / пробный запуск" : "Импорт"}</span>
                        <Badge
                          variant={runStatus.tone === "ok" ? "secondary" : "outline"}
                          className={cn("font-normal", runBadgeClass(runStatus.tone))}
                        >
                          {runStatus.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {integrationModeLabel(run.mode)} · {formatDate(run.startedAt)} · {run.actor?.name ?? "Автоматика"}
                      </p>
                    </div>
                    {job && jobStatus ? (
                      <Link
                        href={`/admin/system/jobs/${job.id}`}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Job {job.id.slice(0, 8)} · {jobStatus.label}
                      </Link>
                    ) : null}
                  </div>

                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-medium text-muted-foreground">Объем</p>
                      <p className="text-sm tabular-nums text-muted-foreground">
                        {run.importedCount}/{run.requestedLimit} · ошибок {run.errorCount}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-medium text-muted-foreground">Финиш</p>
                      <p className="text-sm tabular-nums text-muted-foreground">{formatDate(run.finishedAt)}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-medium text-muted-foreground">Строки</p>
                      <p className="text-sm tabular-nums text-muted-foreground">{russianPlural(run.items.length, ["строка", "строки", "строк"])}</p>
                    </div>
                  </div>

                  {run.errorMessage ? (
                    <Alert variant="destructive">
                      <AlertDescription>{run.errorMessage}</AlertDescription>
                    </Alert>
                  ) : null}

                  {run.items.length > 0 ? (
                    <Table className="min-w-[760px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Внешний ID</TableHead>
                          <TableHead>Тикет</TableHead>
                          <TableHead>Статус</TableHead>
                          <TableHead>Статьи</TableHead>
                          <TableHead>Очередь проверок</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {run.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-xs">{item.externalId}</TableCell>
                            <TableCell className="font-mono text-xs">{item.ticketNumber ?? "Нет"}</TableCell>
                            <TableCell>
                              <Badge
                                variant={item.status === "imported" ? "secondary" : "outline"}
                                className={cn(
                                  "font-normal",
                                  item.status === "imported" &&
                                    "border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                                )}
                              >
                                {integrationRunItemStatusLabel(item.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              {formatArticleCount(item.articleCount)} · приватных {item.privateArticleCount} · {formatAttachmentCount(item.attachmentCount)}
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              {item.conversationId ? (
                                <Link
                                  href={`/reviews/${item.conversationId}`}
                                  className="font-medium text-primary underline-offset-4 hover:underline"
                                >
                                  {item.conversation?.subject ?? "Открыть /reviews"}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">Не импортировано</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
