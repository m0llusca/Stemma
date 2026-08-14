import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Crosshair,
  Gauge,
  PlusCircle,
  TriangleAlert,
  UsersRound,
  X
} from "lucide-react";
import { Suspense, type CSSProperties } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { StatKpi } from "@/components/ui/stat-kpi";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TriageStrip, type TriageStripTone } from "@/components/ui/triage-strip";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { createCalibrationSession, updateCalibrationSessionStatus } from "@/lib/calibration-actions";
import { computeCalibrationItemAgreement, type CalibrationCriterionKind } from "@/lib/calibration/agreement";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { russianPlural } from "@/lib/reports/report-format";
import { formatQualityScore } from "@/lib/score-display";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ALIGNMENT_BAND = 10;

type CalibrationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Черновик",
    active: "Активна",
    completed: "Завершена",
    archived: "В архиве"
  };

  return labels[status] ?? status;
}

function statusTone(status: string): StatusBadgeTone {
  if (status === "completed") {
    return "success";
  }

  if (status === "active") {
    return "info";
  }

  return "neutral";
}

function signedDelta(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function scoreSpread(scores: number[]) {
  if (scores.length < 2) {
    return null;
  }

  return Math.max(...scores) - Math.min(...scores);
}

function calibrationHref(params: { sessionId?: string; newSession?: boolean }) {
  const searchParams = new URLSearchParams();

  if (params.sessionId) {
    searchParams.set("session", params.sessionId);
  }

  if (params.newSession) {
    searchParams.set("new", "1");
  }

  const query = searchParams.toString();
  return query ? `/calibration?${query}` : "/calibration";
}

function matrixCellStyle(delta: number): CSSProperties {
  const magnitude = Math.min(Math.abs(delta), 40);
  const intensity = magnitude / 40;
  const outOfBand = Math.abs(delta) > ALIGNMENT_BAND;
  const token = outOfBand ? "var(--destructive)" : "var(--primary)";
  const mix = Math.round((outOfBand ? 18 : 8) + intensity * (outOfBand ? 40 : 22));

  return {
    backgroundColor: `color-mix(in oklch, ${token} ${mix}%, transparent)`
  };
}

export default function CalibrationPage({ searchParams }: CalibrationPageProps) {
  return (
    <Suspense fallback={<PageSkeleton label="Загрузка калибровки" />}>
      <CalibrationPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CalibrationPageContent({ searchParams }: CalibrationPageProps) {
  const [user, rawSearchParams] = await Promise.all([requireCurrentUserPermission("calibration:manage"), searchParams]);
  const selectedSessionId = firstParam(rawSearchParams.session);
  const openNewSession = firstParam(rawSearchParams.new) === "1";
  const [sessions, qaUsers, conversations] = await Promise.all([
    prisma.calibrationSession.findMany({
      where: { workspaceId: user.workspaceId },
      include: {
        owner: true,
        scorecard: { include: { criteria: { orderBy: { order: "asc" } } } },
        participants: { include: { user: true }, orderBy: { createdAt: "asc" } },
        items: {
          include: {
            conversation: {
              include: {
                reviews: { include: { reviewer: true, scores: true } },
                _count: { select: { coachingPins: true } }
              }
            }
          }
        }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 12
    }),
    prisma.user.findMany({
      where: { workspaceId: user.workspaceId, role: { in: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"] } },
      orderBy: { name: "asc" }
    }),
    prisma.conversation.findMany({
      where: {
        workspaceId: user.workspaceId,
        qaStatus: "FINALIZED",
        reviews: { some: { status: "FINALIZED", reviewSource: "HUMAN" } }
      },
      orderBy: { updatedAt: "desc" },
      take: 8
    })
  ]);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
  const selectedItemCount = selectedSession?.items.length ?? 0;
  const selectedParticipantCount = selectedSession?.participants.length ?? 0;
  const selectedCalibrationReviews =
    selectedSession?.items.flatMap((item) =>
      item.conversation.reviews.filter(
        (review) =>
          review.reviewSource === "CALIBRATION" &&
          review.status === "FINALIZED" &&
          selectedSession.participants.some((participant) => participant.userId === review.reviewerId)
      )
    ) ?? [];
  const selectedCompletedCount = new Set(selectedCalibrationReviews.map((review) => `${review.conversationId}:${review.reviewerId}`)).size;
  const selectedExpectedCount = selectedItemCount * selectedParticipantCount;
  const selectedWaitingCount = Math.max(selectedExpectedCount - selectedCompletedCount, 0);
  const selectedProgress = selectedExpectedCount > 0 ? Math.round((selectedCompletedCount / selectedExpectedCount) * 100) : 0;
  const activeSessionCount = sessions.filter((session) => session.status === "active" || session.status === "draft").length;
  // Criteria of the scorecard this session was created against — the reference set
  // for per-criterion consensus.
  const selectedScorecardCriteria = selectedSession?.scorecard.criteria ?? [];
  const agreementCriteria = selectedScorecardCriteria.map((criterion) => ({
    id: criterion.id,
    kind: criterion.kind as CalibrationCriterionKind
  }));
  const criterionMetaById = new Map(
    selectedScorecardCriteria.map((criterion) => [criterion.id, { label: criterion.label, block: criterion.block }])
  );
  const selectedItemStates =
    selectedSession?.items.map((item) => {
      const baselineReview =
        item.conversation.reviews.find((review) => review.id === item.baselineReviewId) ??
        item.conversation.reviews.find((review) => review.reviewSource === "HUMAN" && review.status === "FINALIZED");
      const reviews = item.conversation.reviews.filter(
        (review) =>
          review.reviewSource === "CALIBRATION" &&
          review.status === "FINALIZED" &&
          selectedSession.participants.some((participant) => participant.userId === review.reviewerId)
      );
      const scores = reviews.map((review) => Math.round(review.totalScore));
      const spread = scoreSpread(scores);
      const missingParticipants = selectedSession.participants.filter(
        (participant) => !reviews.some((review) => review.reviewerId === participant.userId)
      );
      const baselineScore = baselineReview ? Math.round(baselineReview.totalScore) : null;
      // Per-reviewer signed delta vs the reference review, keyed by participant.
      const reviewerDeltas = new Map<string, number>();
      if (baselineScore != null) {
        for (const review of reviews) {
          reviewerDeltas.set(review.reviewerId, Math.round(review.totalScore) - baselineScore);
        }
      }
      const itemDeltas = [...reviewerDeltas.values()];
      const alignedCount = itemDeltas.filter((delta) => Math.abs(delta) <= ALIGNMENT_BAND).length;
      const alignmentPercent = itemDeltas.length > 0 ? Math.round((alignedCount / itemDeltas.length) * 100) : null;
      // Per-criterion consensus: how often participants land on the same answer for
      // each criterion, plus scale spread and whether the modal answer matches the baseline.
      const criterionAgreement = computeCalibrationItemAgreement({
        criteria: agreementCriteria,
        participants: reviews.map((review) => ({ scores: review.scores })),
        baseline: baselineReview ? { scores: baselineReview.scores } : null
      });

      return {
        item,
        baselineReview,
        baselineScore,
        reviews,
        reviewerDeltas,
        alignedCount,
        gradedCount: itemDeltas.length,
        alignmentPercent,
        spread,
        missingParticipants,
        criterionAgreement
      };
    }) ?? [];
  const selectedDisagreementCount = selectedItemStates.filter((state) => state.spread != null && state.spread > 10).length;
  // First item still missing at least one participant's grade (else the first item) — the "Разобрать" target.
  const selectedFirstOpenItem =
    selectedItemStates.find((state) => state.missingParticipants.length > 0)?.item ?? selectedSession?.items[0];
  // Alignment vs baseline: industry practice expects 85–90% of calibration scores
  // to land within ±10 points of the reference review.
  const alignmentPairs = selectedItemStates.flatMap((state) => {
    const baseline = state.baselineReview;
    if (!baseline) {
      return [];
    }
    const baselineScore = Math.round(baseline.totalScore);
    return state.reviews.map((review) => ({
      reviewerId: review.reviewerId,
      delta: Math.round(review.totalScore) - baselineScore
    }));
  });
  const alignedPairCount = alignmentPairs.filter((pair) => Math.abs(pair.delta) <= 10).length;
  const selectedAlignmentPercent =
    alignmentPairs.length > 0 ? Math.round((alignedPairCount / alignmentPairs.length) * 100) : null;
  const participantBiasRows = (selectedSession?.participants ?? [])
    .map((participant) => {
      const deltas = alignmentPairs
        .filter((pair) => pair.reviewerId === participant.userId)
        .map((pair) => pair.delta);

      if (deltas.length === 0) {
        return null;
      }

      return {
        id: participant.id,
        name: participant.user.name,
        averageDelta: Math.round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length)
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  const participantBiasById = new Map(participantBiasRows.map((row) => [row.id, row.averageDelta]));
  const sessionSummaries = sessions.map((session) => {
    const participantIds = new Set(session.participants.map((participant) => participant.userId));
    const calibrationReviews = session.items.flatMap((item) =>
      item.conversation.reviews.filter(
        (review) => review.reviewSource === "CALIBRATION" && review.status === "FINALIZED" && participantIds.has(review.reviewerId)
      )
    );
    const completedCount = new Set(calibrationReviews.map((review) => `${review.conversationId}:${review.reviewerId}`)).size;
    const expectedCount = session.items.length * session.participants.length;
    const disagreementCount = session.items.filter((item) => {
      const scores = item.conversation.reviews
        .filter((review) => review.reviewSource === "CALIBRATION" && review.status === "FINALIZED" && participantIds.has(review.reviewerId))
        .map((review) => Math.round(review.totalScore));
      const spread = scoreSpread(scores);

      return spread != null && spread > 10;
    }).length;

    return {
      session,
      completedCount,
      disagreementCount,
      expectedCount,
      itemCount: session.items.length,
      participantCount: session.participants.length,
      progress: expectedCount > 0 ? Math.round((completedCount / expectedCount) * 100) : 0,
      waitingCount: Math.max(expectedCount - completedCount, 0)
    };
  });
  const selectedSessionIsOpen = selectedSession?.status === "active" || selectedSession?.status === "draft";
  const disagreementLabel = russianPlural(selectedDisagreementCount, ["расхождение требует", "расхождения требуют", "расхождений требуют"]);
  const waitingScoresLabel = russianPlural(selectedWaitingCount, ["оценка ещё ждёт", "оценки ещё ждут", "оценок ещё ждут"]);
  const calibrationNextAction = !selectedSession
    ? "Создайте первую сессию из финализированных проверок."
    : selectedItemCount === 0
      ? "Добавьте обращения, чтобы участники оценивали один и тот же набор."
      : selectedParticipantCount === 0
        ? "Добавьте проверяющих в сессию."
        : selectedWaitingCount > 0
          ? `Не хватает ${russianPlural(selectedWaitingCount, ["оценки", "оценок", "оценок"])} — дождитесь участников или напомните им перед разбором.`
          : selectedDisagreementCount > 0
            ? `Разберите ${russianPlural(selectedDisagreementCount, ["расхождение", "расхождения", "расхождений"])} и зафиксируйте общее правило.`
            : selectedAlignmentPercent != null && selectedAlignmentPercent < 85
              ? "Проверьте смещение участников относительно эталона."
              : selectedSessionIsOpen
                ? "Калибровка готова к завершению."
                : "Сессия закрыта, результаты можно использовать для методологии и обучения.";
  const calibrationDecisionMeta = selectedSession
    ? [
        { label: "Обращения", value: selectedItemCount.toString(), icon: ClipboardCheck },
        { label: "Участники", value: selectedParticipantCount.toString(), icon: UsersRound },
        {
          label: "Готово",
          value: `${selectedCompletedCount}/${selectedExpectedCount}`,
          icon: Gauge
        },
        {
          label: "Срок",
          value: selectedSession.dueAt ? selectedSession.dueAt.toLocaleDateString("ru-RU") : "нет",
          icon: CalendarClock
        }
      ]
    : [];
  const newSessionHref = calibrationHref({ sessionId: selectedSession?.id, newSession: true });
  const closeNewSessionHref = calibrationHref({ sessionId: selectedSession?.id });
  const calibrationTriageTone: TriageStripTone = !selectedSession
    ? "accent"
    : selectedDisagreementCount > 0
      ? "warning"
      : selectedWaitingCount > 0
        ? "accent"
        : selectedAlignmentPercent != null && selectedAlignmentPercent < 85
          ? "warning"
          : selectedSessionIsOpen
            ? "accent"
            : "success";
  const calibrationTriageAction =
    selectedSession && selectedSessionIsOpen && selectedFirstOpenItem ? (
      <Button
        size="sm"
        render={
          <Link
            href={`/reviews/${selectedFirstOpenItem.conversationId}?reviewSource=CALIBRATION&returnTo=${encodeURIComponent(`/calibration?session=${selectedSession.id}`)}`}
          />
        }
        nativeButton={false}
      >
        Разобрать
        <ArrowRight data-icon="inline-end" size={16} aria-hidden="true" />
      </Button>
    ) : undefined;
  const hasMatrix = selectedItemStates.length > 0 && (selectedSession?.participants.length ?? 0) > 0;

  return (
    <PageShell
      eyebrow="Контроль качества"
      title="Калибровка"
      description="Проверяющие оценивают одни и те же обращения. Руководитель видит расхождения и фиксирует единое правило."
      actions={
        <Button
          variant={openNewSession ? "outline" : "default"}
          render={<Link href={openNewSession ? closeNewSessionHref : newSessionHref} />}
          nativeButton={false}
        >
          {openNewSession ? <X data-icon="inline-start" size={18} aria-hidden="true" /> : <PlusCircle data-icon="inline-start" size={18} aria-hidden="true" />}
          {openNewSession ? "Скрыть форму" : "Новая сессия"}
        </Button>
      }
    >
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <TriageStrip
          tone={calibrationTriageTone}
          icon={selectedDisagreementCount > 0 ? <TriangleAlert size={18} aria-hidden="true" /> : <Crosshair size={18} aria-hidden="true" />}
          title={
            selectedSession
              ? selectedDisagreementCount > 0
                ? `${disagreementLabel} разбора`
                : selectedWaitingCount > 0
                  ? waitingScoresLabel
                  : "Сессия готова к разбору"
              : "Нет активной калибровки"
          }
          description={calibrationNextAction}
          action={calibrationTriageAction}
        />

        <div className="grid gap-3 sm:grid-cols-2" aria-label="Ключевые показатели калибровки">
          <StatKpi
            label="Согласованность"
            value={selectedAlignmentPercent != null ? `${selectedAlignmentPercent}%` : "—"}
            hint={selectedAlignmentPercent != null ? "Цель — 85–90% в пределах ±10" : "Появится после оценок участников"}
          />
          <StatKpi
            label="Готовность"
            value={`${selectedProgress}%`}
            hint={selectedWaitingCount > 0 ? waitingScoresLabel : "Все оценки собраны"}
          />
          <StatKpi
            label="Расхождения"
            value={selectedDisagreementCount}
            hint={selectedDisagreementCount > 0 ? `Разброс выше ±${ALIGNMENT_BAND} баллов` : "Оценки в пределах нормы"}
          />
          <StatKpi
            label="Активных сессий"
            value={activeSessionCount}
            hint={`${sessions.length} всего в рабочей области`}
          />
        </div>
      </div>

      {openNewSession ? (
        <Card aria-label="Новая калибровка">
          <CardHeader className="border-b">
            <CardTitle>Новая калибровка</CardTitle>
            <CardDescription>Выберите проверяющих и обращения. После создания участники получат один и тот же набор для оценки.</CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" render={<Link href={closeNewSessionHref} />} nativeButton={false}>
                Скрыть
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <form action={createCalibrationSession} className="flex flex-col gap-5">
              <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="calibration-name">Название</FieldLabel>
                  <Input id="calibration-name" name="name" required defaultValue="Калибровка недели" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="calibration-due">Срок</FieldLabel>
                  <Input id="calibration-due" name="dueAt" type="date" />
                </Field>
                <Field className="sm:col-span-2 lg:col-span-1">
                  <FieldLabel htmlFor="calibration-notes">Заметки</FieldLabel>
                  <Textarea id="calibration-notes" name="notes" rows={2} />
                </Field>
              </FieldGroup>

              <div className="grid gap-4 md:grid-cols-2">
                <FieldSet>
                  <FieldLegend>Участники</FieldLegend>
                  <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
                    {qaUsers.map((qaUser) => (
                      <FieldLabel
                        key={qaUser.id}
                        className="cursor-pointer items-start rounded-lg border border-border bg-background px-3 py-2.5 font-normal has-data-checked:border-primary/40 has-data-checked:bg-primary/5"
                      >
                        <Checkbox
                          name="participantId"
                          value={qaUser.id}
                          defaultChecked={qaUser.id === user.id}
                          className="mt-0.5"
                        />
                        <span className="text-sm leading-snug">{qaUser.name}</span>
                      </FieldLabel>
                    ))}
                  </div>
                </FieldSet>

                <FieldSet>
                  <FieldLegend>Обращения</FieldLegend>
                  <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
                    {conversations.map((conversation) => (
                      <FieldLabel
                        key={conversation.id}
                        className="cursor-pointer items-start rounded-lg border border-border bg-background px-3 py-2.5 font-normal has-data-checked:border-primary/40 has-data-checked:bg-primary/5"
                      >
                        <Checkbox
                          name="conversationId"
                          value={conversation.id}
                          className="mt-0.5"
                        />
                        <span className="flex min-w-0 flex-col gap-0.5 text-sm leading-snug">
                          <strong className="font-medium">{conversation.externalId}</strong>
                          <span className="text-muted-foreground">{conversation.subject}</span>
                        </span>
                      </FieldLabel>
                    ))}
                  </div>
                </FieldSet>
              </div>

              <ValidatedSubmitButton className={buttonVariants()} minCheckedNames={["participantId", "conversationId"]}>
                Создать сессию
              </ValidatedSubmitButton>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card aria-label="Сессии калибровки">
        <CardHeader className="border-b">
          <CardTitle>Сессии</CardTitle>
          <CardDescription>Выберите сессию, затем разберите ожидания и расхождения.</CardDescription>
          <CardAction>
            <Badge variant="secondary">{sessions.length}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          {sessionSummaries.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sessionSummaries.map((summary) => {
                const isSelected = selectedSession?.id === summary.session.id;

                return (
                  <Link
                    key={summary.session.id}
                    href={calibrationHref({ sessionId: summary.session.id })}
                    aria-current={isSelected ? "page" : undefined}
                    className={cn(
                      "flex min-w-[11.5rem] max-w-[16rem] shrink-0 flex-col gap-2 rounded-xl border px-3 py-3 transition-colors",
                      isSelected
                        ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                        : "border-border bg-card hover:bg-muted/40"
                    )}
                  >
                    <StatusBadge tone={statusTone(summary.session.status)}>{statusLabel(summary.session.status)}</StatusBadge>
                    <strong className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{summary.session.name}</strong>
                    <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{summary.progress}% готово</span>
                      <span>{summary.waitingCount} ждут</span>
                      <span>{summary.disagreementCount} расх.</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Пока нет сессий. Создайте первую калибровку.</p>
          )}
        </CardContent>
      </Card>

      {selectedSession ? (
        <Card aria-label="Рабочая область калибровки">
          <CardHeader className="border-b">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <CardTitle>{selectedSession.name}</CardTitle>
              <StatusBadge tone={statusTone(selectedSession.status)}>{statusLabel(selectedSession.status)}</StatusBadge>
            </div>
            <CardDescription>
              {selectedSession.notes || "Сравните оценки по одним обращениям и зафиксируйте, где правило трактуется по-разному."}
            </CardDescription>
            <CardAction className="flex flex-wrap items-center gap-2">
              {selectedSession.status === "active" || selectedSession.status === "draft" ? (
                <form action={updateCalibrationSessionStatus}>
                  <input type="hidden" name="id" value={selectedSession.id} />
                  <input type="hidden" name="status" value="completed" />
                  <Button type="submit" size="sm">
                    <CheckCircle2 data-icon="inline-start" size={16} aria-hidden="true" />
                    Завершить
                  </Button>
                </form>
              ) : selectedSession.status === "completed" || selectedSession.status === "archived" ? (
                <form action={updateCalibrationSessionStatus}>
                  <input type="hidden" name="id" value={selectedSession.id} />
                  <input type="hidden" name="status" value="active" />
                  <Button type="submit" variant="outline" size="sm">
                    Вернуть в работу
                  </Button>
                </form>
              ) : null}
            </CardAction>
          </CardHeader>

          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-wrap gap-3" aria-label="Параметры сессии калибровки">
              {calibrationDecisionMeta.map((meta) => {
                const Icon = meta.icon;

                return (
                  <div
                    key={meta.label}
                    className="flex min-w-[7.5rem] items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
                  >
                    <Icon size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">{meta.label}</span>
                      <span className="text-sm font-medium tabular-nums text-foreground">{meta.value}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <Tabs defaultValue={hasMatrix ? "matrix" : "consensus"} className="gap-4">
              <TabsList>
                <TabsTrigger value="matrix">Матрица</TabsTrigger>
                <TabsTrigger value="consensus">
                  Консенсус
                  <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-xs">
                    {selectedItemStates.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="matrix" className="flex flex-col gap-3">
                {hasMatrix ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <h3 className="text-sm font-medium text-foreground">Матрица согласованности</h3>
                      <p className="text-sm text-muted-foreground">
                        Отклонение каждого участника от эталона по каждому обращению. Чем темнее, тем дальше от ±{ALIGNMENT_BAND}. Нижняя
                        строка — среднее смещение участника.
                      </p>
                    </div>
                    <Table aria-label="Согласованность по участникам и обращениям">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[10rem]">Обращение</TableHead>
                          {selectedSession.participants.map((participant) => (
                            <TableHead key={participant.id} className="min-w-[5.5rem] text-center">
                              <div className="flex flex-col items-center gap-1.5">
                                <span
                                  className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                                  aria-hidden="true"
                                >
                                  {initialsOf(participant.user.name)}
                                </span>
                                <span className="max-w-[6rem] truncate text-xs font-medium normal-case">{participant.user.name}</span>
                              </div>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedItemStates.map((state) => (
                          <TableRow key={state.item.id}>
                            <TableCell className="whitespace-normal">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-medium text-foreground">{state.item.conversation.subject}</span>
                                <span className="text-xs text-muted-foreground">
                                  {state.alignmentPercent != null ? `${state.alignmentPercent}% в норме` : "нет эталона"}
                                </span>
                              </div>
                            </TableCell>
                            {selectedSession.participants.map((participant) => {
                              const delta = state.reviewerDeltas.get(participant.userId);

                              if (delta == null) {
                                return (
                                  <TableCell key={participant.id} className="text-center text-muted-foreground">
                                    <span aria-hidden="true">·</span>
                                    <span className="sr-only">нет оценки</span>
                                  </TableCell>
                                );
                              }

                              const outOfBand = Math.abs(delta) > ALIGNMENT_BAND;

                              return (
                                <TableCell
                                  key={participant.id}
                                  className={cn(
                                    "text-center tabular-nums font-medium",
                                    outOfBand ? "text-destructive" : "text-foreground"
                                  )}
                                  style={matrixCellStyle(delta)}
                                  title={`${participant.user.name}: ${signedDelta(delta)} от эталона`}
                                >
                                  {signedDelta(delta)}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                      {participantBiasRows.length > 0 ? (
                        <TableFooter>
                          <TableRow>
                            <TableCell className="whitespace-normal">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-medium">Среднее смещение</span>
                                <span className="text-xs font-normal text-muted-foreground">отклонение от эталона</span>
                              </div>
                            </TableCell>
                            {selectedSession.participants.map((participant) => {
                              const averageDelta = participantBiasById.get(participant.id);

                              if (averageDelta == null) {
                                return (
                                  <TableCell key={participant.id} className="text-center text-muted-foreground">
                                    <span aria-hidden="true">·</span>
                                    <span className="sr-only">нет оценки</span>
                                  </TableCell>
                                );
                              }

                              const outOfBand = Math.abs(averageDelta) > ALIGNMENT_BAND;

                              return (
                                <TableCell
                                  key={participant.id}
                                  className={cn(
                                    "text-center tabular-nums font-semibold",
                                    outOfBand ? "text-destructive" : "text-foreground"
                                  )}
                                  style={matrixCellStyle(averageDelta)}
                                  title={
                                    averageDelta === 0
                                      ? `${participant.user.name}: в пределах эталона`
                                      : averageDelta > 0
                                        ? `${participant.user.name}: мягче эталона на ${averageDelta}`
                                        : `${participant.user.name}: строже эталона на ${Math.abs(averageDelta)}`
                                  }
                                >
                                  {signedDelta(averageDelta)}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        </TableFooter>
                      ) : null}
                    </Table>
                  </>
                ) : (
                  <EmptyState
                    size="inline"
                    icon={<Crosshair size={20} aria-hidden="true" />}
                    title="Матрица пока пуста"
                    description="Добавьте участников и обращения в сессию, чтобы увидеть отклонения от эталона."
                  />
                )}
              </TabsContent>

              <TabsContent value="consensus" className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium text-foreground">Консенсус по обращениям</h3>
                  <p className="text-sm text-muted-foreground">
                    Доля оценок в пределах ±{ALIGNMENT_BAND} баллов от эталона. Откройте обращение, чтобы зафиксировать общее правило.
                  </p>
                </div>

                {selectedItemStates.length > 0 ? (
                  <div className="flex flex-col gap-3" aria-label="Согласованность по обращениям">
                    {selectedItemStates.map(
                      ({
                        item,
                        baselineReview,
                        baselineScore,
                        reviews,
                        reviewerDeltas,
                        alignedCount,
                        gradedCount,
                        alignmentPercent,
                        spread,
                        criterionAgreement
                      }) => {
                        const completedCount = reviews.length;
                        const expectedCount = selectedSession.participants.length;
                        const attention = spread != null && spread > ALIGNMENT_BAND;
                        const offBandCount = Math.max(gradedCount - alignedCount, 0);
                        const alignedPct = gradedCount > 0 ? (alignedCount / gradedCount) * 100 : 0;
                        const offBandPct = gradedCount > 0 ? (offBandCount / gradedCount) * 100 : 0;
                        // Per-criterion consensus rows, most-misaligned first. Rows without a
                        // rate (fewer than two answers) sink to the bottom.
                        const criterionRows = criterionAgreement.criteria
                          .map((entry) => ({ ...entry, meta: criterionMetaById.get(entry.criterionId) }))
                          .filter((entry) => entry.meta != null && entry.participantCount > 0)
                          .sort((a, b) => {
                            const rateA = a.agreementRate ?? Number.POSITIVE_INFINITY;
                            const rateB = b.agreementRate ?? Number.POSITIVE_INFINITY;
                            return rateA - rateB;
                          });

                        return (
                          <Card
                            key={item.id}
                            size="sm"
                            className={cn(attention && "ring-1 ring-amber-500/30")}
                          >
                            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
                              <div className="flex min-w-0 flex-1 flex-col gap-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <Link
                                    href={`/reviews/${item.conversationId}`}
                                    className="text-sm font-medium text-foreground hover:underline"
                                  >
                                    {item.conversation.subject}
                                  </Link>
                                  {attention ? (
                                    <Badge
                                      variant="outline"
                                      className="border-transparent bg-amber-500/15 text-amber-900 dark:text-amber-300"
                                    >
                                      Разброс {spread != null ? formatQualityScore(spread) : "—"}
                                    </Badge>
                                  ) : null}
                                </div>

                                <div className="flex flex-col gap-2">
                                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <span className="flex items-baseline gap-2 text-sm">
                                      <strong className="font-medium">Согласованность</strong>
                                      <span className="tabular-nums text-muted-foreground">
                                        {alignmentPercent != null ? `${alignmentPercent}%` : "нет эталона"}
                                      </span>
                                    </span>
                                    {baselineScore != null ? (
                                      <span className="text-xs text-muted-foreground">
                                        Эталон {baselineScore} · {baselineReview?.reviewer.name}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">нет финальной проверки</span>
                                    )}
                                  </div>
                                  {gradedCount > 0 ? (
                                    <div
                                      className="flex h-2 overflow-hidden rounded-full bg-muted"
                                      role="img"
                                      aria-label={`${alignedCount} из ${gradedCount} в пределах ±${ALIGNMENT_BAND}`}
                                    >
                                      <span className="h-full bg-emerald-500/70" style={{ width: `${alignedPct}%` }} />
                                      <span className="h-full bg-amber-500/70" style={{ width: `${offBandPct}%` }} />
                                    </div>
                                  ) : (
                                    <div className="h-2 rounded-full bg-muted" aria-hidden="true" />
                                  )}
                                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                    <span>{alignedCount} в норме</span>
                                    {offBandCount > 0 ? (
                                      <span className="text-amber-800 dark:text-amber-300">
                                        {offBandCount} вне ±{ALIGNMENT_BAND}
                                      </span>
                                    ) : null}
                                    <span>
                                      Готово {completedCount}/{expectedCount}
                                    </span>
                                    {item.conversation._count.coachingPins > 0 ? (
                                      <span>Заметки {item.conversation._count.coachingPins}</span>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2" aria-label="Оценки участников">
                                  {selectedSession.participants.map((participant) => {
                                    const review = reviews.find((candidate) => candidate.reviewerId === participant.userId);
                                    const delta = reviewerDeltas.get(participant.userId);
                                    const outOfBand = delta != null && Math.abs(delta) > ALIGNMENT_BAND;

                                    return (
                                      <span
                                        key={participant.id}
                                        className={cn(
                                          "inline-flex items-center gap-2 rounded-lg border px-2 py-1.5",
                                          !review && "border-dashed border-border opacity-70",
                                          review && outOfBand && "border-destructive/30 bg-destructive/5",
                                          review && !outOfBand && "border-border bg-muted/30"
                                        )}
                                        title={
                                          review
                                            ? `${participant.user.name}: ${formatQualityScore(review.totalScore)}${delta != null ? ` (${signedDelta(delta)})` : ""}`
                                            : `${participant.user.name}: ждёт оценки`
                                        }
                                      >
                                        <span
                                          className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-[0.65rem] font-medium text-muted-foreground"
                                          aria-hidden="true"
                                        >
                                          {initialsOf(participant.user.name)}
                                        </span>
                                        <span className="flex flex-col leading-none">
                                          <span className="text-sm font-medium tabular-nums text-foreground">
                                            {review ? Math.round(review.totalScore) : "—"}
                                          </span>
                                          {delta != null ? (
                                            <span
                                              className={cn(
                                                "text-[0.65rem] tabular-nums",
                                                outOfBand ? "text-destructive" : "text-muted-foreground"
                                              )}
                                            >
                                              {signedDelta(delta)}
                                            </span>
                                          ) : null}
                                        </span>
                                      </span>
                                    );
                                  })}
                                </div>

                                {criterionRows.length > 0 ? (
                                  <div className="flex flex-col gap-2" aria-label="Согласованность по критериям">
                                    <div className="flex flex-col gap-0.5">
                                      <strong className="text-sm font-medium">По критериям</strong>
                                      <span className="text-xs text-muted-foreground">
                                        Доля совпавших ответов участников. Сначала самые спорные.
                                      </span>
                                    </div>
                                    <ul className="flex flex-col gap-1.5">
                                      {criterionRows.map((row) => {
                                        const misaligned = row.agreementRate != null && row.agreementRate < 0.75;

                                        return (
                                          <li
                                            key={row.criterionId}
                                            className={cn(
                                              "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-2",
                                              misaligned
                                                ? "border-amber-500/30 bg-amber-500/5"
                                                : "border-border bg-background"
                                            )}
                                          >
                                            <span className="flex min-w-0 flex-col gap-0.5">
                                              <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                                                {row.meta?.block}
                                              </span>
                                              <span className="text-sm text-foreground">{row.meta?.label}</span>
                                            </span>
                                            <span className="flex flex-wrap items-center gap-2">
                                              <span className="text-sm font-medium tabular-nums">
                                                {row.agreementRate != null ? `${Math.round(row.agreementRate * 100)}%` : "—"}
                                              </span>
                                              {row.scaleSpread != null && row.scaleSpread > 0 ? (
                                                <span className="text-xs text-muted-foreground" title="Разброс баллов по шкале">
                                                  разброс {row.scaleSpread}
                                                </span>
                                              ) : null}
                                              {row.matchesBaseline === false ? (
                                                <Badge
                                                  variant="outline"
                                                  className="border-transparent bg-amber-500/15 text-amber-900 dark:text-amber-300"
                                                >
                                                  ≠ эталон
                                                </Badge>
                                              ) : row.matchesBaseline === true ? (
                                                <Badge
                                                  variant="outline"
                                                  className="border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                                                >
                                                  = эталон
                                                </Badge>
                                              ) : null}
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>

                              <div className="shrink-0 sm:pt-0.5">
                                {selectedSession.status === "active" || selectedSession.status === "draft" ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    render={
                                      <Link
                                        href={`/reviews/${item.conversationId}?reviewSource=CALIBRATION&returnTo=${encodeURIComponent(`/calibration?session=${selectedSession.id}`)}`}
                                      />
                                    }
                                    nativeButton={false}
                                  >
                                    Оценить
                                  </Button>
                                ) : (
                                  <Badge variant="secondary">
                                    {selectedSession.status === "archived" ? "Архив" : "Завершена"}
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      }
                    )}
                  </div>
                ) : (
                  <EmptyState
                    size="inline"
                    icon={<ClipboardCheck size={20} aria-hidden="true" />}
                    title="Нет обращений в сессии"
                    description="Добавьте финализированные проверки, чтобы участники оценивали один набор."
                  />
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={<ClipboardCheck size={24} aria-hidden="true" />}
          title="Нет калибровок"
          description="Создайте первую сессию из проверенных обращений и выберите участников."
          action={
            <Button render={<Link href={newSessionHref} />} nativeButton={false}>
              <PlusCircle data-icon="inline-start" size={16} aria-hidden="true" />
              Новая сессия
            </Button>
          }
        />
      )}
    </PageShell>
  );
}
