import { ChevronDown, Gauge, History, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { PageSkeleton } from "@/components/loading-states";
import { ScorecardVersionForm } from "@/components/scorecards/scorecard-version-form";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminFrame } from "@/components/admin/admin-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { PageShell } from "@/components/ui/page-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { getSettingCoachmark } from "@/lib/admin-setup-guidance";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { criterionKindLabels } from "@/lib/labels";
import { russianPlural } from "@/lib/reports/report-format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type AdminScorecardsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ScorecardSection = "overview" | "create" | "history";

/** «Новая версия» больше не вкладка: короткий вход через диалог поверх списка. */
const scorecardSections: Array<{ value: ScorecardSection; label: string }> = [
  { value: "overview", label: "Активная форма" },
  { value: "history", label: "История" }
];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function scorecardSectionParam(
  value: string | string[] | undefined,
  newValue: string | string[] | undefined
): ScorecardSection {
  if (firstParam(newValue) === "1") {
    return "create";
  }

  const section = firstParam(value);

  if (section === "create") {
    return "create";
  }

  return scorecardSections.some((item) => item.value === section) ? (section as ScorecardSection) : "overview";
}

function scorecardSectionHref(section: ScorecardSection) {
  return `/admin/scorecards?section=${section}`;
}

function activeScorecardEditHref(editing: boolean) {
  return editing ? "/admin/scorecards?section=overview" : "/admin/scorecards?section=overview&edit=1";
}

export default function AdminScorecardsPage({ searchParams }: AdminScorecardsPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/scorecards")} />}>
      <AdminScorecardsPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminScorecardsPageContent({ searchParams }: AdminScorecardsPageProps) {
  const params = await searchParams;
  const requestedSection = scorecardSectionParam(params.section, params.new);
  // «create» — не ветка контента, а флаг открытого диалога поверх обзора.
  const createDialogOpen = requestedSection === "create";
  const activeSection = createDialogOpen ? "overview" : requestedSection;
  const isEditingActiveScorecard = activeSection === "overview" && firstParam(params.edit) === "1";
  const user = await requireCurrentUserPermission("scorecards:manage");
  const activeScorecard = await prisma.scorecard.findFirst({
    where: {
      workspaceId: user.workspaceId,
      isActive: true
    },
    include: {
      criteria: {
        orderBy: {
          order: "asc"
        }
      }
    }
  });
  const scorecards = await prisma.scorecard.findMany({
    where: {
      workspaceId: user.workspaceId
    },
    include: {
      criteria: {
        orderBy: {
          order: "asc"
        }
      }
    },
    orderBy: [
      {
        isActive: "desc"
      },
      {
        updatedAt: "desc"
      }
    ]
  });
  const scorecardSetupHint = activeScorecard ? null : getSettingCoachmark("scorecards");

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin/scorecards"]}
      description="Активную форму можно править точечно, а новую версию выпускать, когда нужно сохранить историческую методику без пересчета."
    >
      <AdminFrame>
        <div className="flex flex-col gap-4">
          <nav
            className="flex flex-wrap items-center justify-between gap-3"
            aria-label="Разделы форм оценки"
          >
            <div
              className="inline-flex h-8 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground"
              role="tablist"
              aria-label="Вкладки формы оценки"
            >
              {scorecardSections.map((section) => {
                const active = activeSection === section.value;
                return (
                  <Link
                    key={section.value}
                    href={scorecardSectionHref(section.value)}
                    role="tab"
                    aria-selected={active}
                    className={cn(
                      "inline-flex h-[calc(100%-1px)] items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all",
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-foreground/60 hover:text-foreground"
                    )}
                  >
                    {section.label}
                  </Link>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AdminDialog
                wide
                defaultOpen={createDialogOpen}
                triggerLabel={
                  <>
                    <Plus size={16} aria-hidden="true" />
                    Новая версия
                  </>
                }
                title="Новая версия формы оценки"
                description="Новая версия становится активной, а исторические проверки остаются на прежней методике."
              >
                {activeScorecard ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2" aria-label="Шаги выпуска формы оценки">
                      <Badge variant="secondary">1. Критерии</Badge>
                      <Badge>2. Веса и шкалы</Badge>
                      <Badge variant="outline">3. Выпуск версии</Badge>
                    </div>
                    <ScorecardVersionForm
                      initialName={activeScorecard.name}
                      initialCriteria={activeScorecard.criteria.map((criterion) => ({
                        id: criterion.id,
                        key: criterion.key,
                        label: criterion.label,
                        block: criterion.block,
                        kind: criterion.kind,
                        weight: criterion.weight,
                        required: criterion.required
                      }))}
                    />
                  </div>
                ) : (
                  <EmptyState
                    size="inline"
                    icon={<Gauge size={20} aria-hidden="true" />}
                    title="Нет активной формы"
                    description="Новую версию можно выпустить после появления активной формы. Создайте первую форму через начальную настройку проекта."
                  />
                )}
              </AdminDialog>
              <Button variant="outline" render={<Link href="/reviews" />} nativeButton={false}>
                Очередь проверок
              </Button>
            </div>
          </nav>

          {activeSection === "overview" ? (
            <Card aria-labelledby="scorecard-overview-title">
              <CardHeader className="border-b">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Активная форма
                  </p>
                  <div className="flex min-w-0 items-center gap-2">
                    <CardTitle id="scorecard-overview-title">Текущая методика оценки</CardTitle>
                    <HelpTooltip
                      label="Чем вес отличается от итоговых баллов?"
                      content="Вес критерия влияет на расчет. Итоговая оценка отображается как нормализованные баллы от 0 до 100."
                      placement="top-start"
                    />
                  </div>
                  <CardDescription>По этой версии создаются новые проверки.</CardDescription>
                </div>
                {activeScorecard ? (
                  <CardAction>
                    <Button
                      variant={isEditingActiveScorecard ? "outline" : "default"}
                      render={<Link href={activeScorecardEditHref(isEditingActiveScorecard)} />}
                      nativeButton={false}
                    >
                      {isEditingActiveScorecard ? "Отмена" : "Редактировать текущую"}
                    </Button>
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent className="pt-(--card-spacing)">
                {isEditingActiveScorecard && activeScorecard ? (
                  <ScorecardVersionForm
                    mode="edit"
                    scorecardId={activeScorecard.id}
                    initialName={activeScorecard.name}
                    initialCriteria={activeScorecard.criteria.map((criterion) => ({
                      id: criterion.id,
                      key: criterion.key,
                      label: criterion.label,
                      block: criterion.block,
                      kind: criterion.kind,
                      weight: criterion.weight,
                      required: criterion.required
                    }))}
                  />
                ) : (
                  <div
                    className={cn(
                      "flex flex-col gap-4",
                      scorecardSetupHint && "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.4fr)] lg:items-start"
                    )}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="grid gap-3 md:grid-cols-2" aria-label="Сводка форм оценки">
                        <Card size="sm">
                          <CardContent className="flex items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
                              V
                            </span>
                            <div className="min-w-0 flex flex-col gap-0.5">
                              <p className="truncate font-medium text-foreground">
                                {activeScorecard
                                  ? `${activeScorecard.name} v${activeScorecard.version}`
                                  : "Нет активной формы"}
                              </p>
                              <p className="text-sm text-muted-foreground tabular-nums">
                                {activeScorecard
                                  ? russianPlural(activeScorecard.criteria.length, ["критерий", "критерия", "критериев"])
                                  : "Создайте первую версию формы оценки"}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                        <Card size="sm">
                          <CardContent className="flex items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold tabular-nums text-muted-foreground">
                              {scorecards.length}
                            </span>
                            <div className="min-w-0 flex flex-col gap-0.5">
                              <p className="font-medium text-foreground">Версий в системе</p>
                              <p className="text-sm text-muted-foreground">
                                Точечная правка меняет активную форму, новая версия сохраняет историю
                                методики.
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {activeScorecard ? (
                        <Table aria-label="Критерии активной формы">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Критерий</TableHead>
                              <TableHead>Блок</TableHead>
                              <TableHead>Тип</TableHead>
                              <TableHead className="text-right">Вес</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {activeScorecard.criteria.slice(0, 6).map((criterion) => (
                              <TableRow key={criterion.id}>
                                <TableCell className="font-medium whitespace-normal">
                                  {criterion.label}
                                </TableCell>
                                <TableCell className="whitespace-normal">{criterion.block}</TableCell>
                                <TableCell>{criterionKindLabels[criterion.kind]}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {criterion.weight}%
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          <TableFooter>
                            <TableRow>
                              <TableCell className="font-medium">Сумма весов</TableCell>
                              <TableCell colSpan={2} aria-hidden="true" />
                              <TableCell className="text-right tabular-nums">
                                {activeScorecard.criteria.reduce(
                                  (sum, criterion) => sum + criterion.weight,
                                  0
                                )}
                                %
                              </TableCell>
                            </TableRow>
                          </TableFooter>
                        </Table>
                      ) : null}
                    </div>

                    {scorecardSetupHint ? (
                      <CoachCallout
                        title={scorecardSetupHint.title}
                        body={scorecardSetupHint.body}
                        href={scorecardSetupHint.href}
                        actionLabel={scorecardSetupHint.actionLabel}
                        variant="spotlight"
                        placement="left"
                        anchorLabel="Подсказка к форме оценки"
                        stepIndex={1}
                        dismissId="settings:scorecards"
                      />
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {activeSection === "history" ? (
            <Card aria-labelledby="scorecard-history-title">
              <CardHeader className="border-b">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    История
                  </p>
                  <CardTitle id="scorecard-history-title">История форм</CardTitle>
                  <CardDescription>
                    Старые версии свернуты и не смешиваются с активной методикой.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 pt-(--card-spacing)">
                {scorecards.length === 0 ? (
                  <EmptyState
                    size="inline"
                    icon={<History size={20} aria-hidden="true" />}
                    title="История пуста"
                    description="Здесь появятся прошлые версии формы после публикации новой."
                  />
                ) : null}
                {scorecards.map((scorecard) => (
                  <Collapsible
                    key={scorecard.id}
                    defaultOpen={scorecard.isActive}
                    className="group rounded-xl ring-1 ring-foreground/10 data-open:bg-muted/20"
                  >
                    <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-3 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold tabular-nums text-muted-foreground">
                        {scorecard.version}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium text-foreground">{scorecard.name}</h3>
                          <Badge variant={scorecard.isActive ? "default" : "secondary"}>
                            {scorecard.isActive ? "Активна" : "Неактивна"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                          {russianPlural(scorecard.criteria.length, ["критерий", "критерия", "критериев"])}
                        </p>
                      </div>
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-transform group-data-open:rotate-180"
                        aria-hidden="true"
                      >
                        <ChevronDown className="size-4" />
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border-t border-border p-3">
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {scorecard.criteria.map((criterion) => (
                          <Card key={criterion.id} size="sm">
                            <CardHeader className="gap-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex flex-col gap-1">
                                  <CardTitle className="text-sm">{criterion.label}</CardTitle>
                                  <CardDescription>
                                    {criterion.block} · {criterionKindLabels[criterion.kind]} · ключ:{" "}
                                    {criterion.key}
                                  </CardDescription>
                                </div>
                                <Badge variant="secondary" className="tabular-nums shrink-0">
                                  Вес {criterion.weight}%
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm text-muted-foreground tabular-nums">
                                Порядок: {criterion.order} · обязательный критерий:{" "}
                                {criterion.required ? "да" : "нет"}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </AdminFrame>
    </PageShell>
  );
}
