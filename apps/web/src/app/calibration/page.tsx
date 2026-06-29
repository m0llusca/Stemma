import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, Crosshair, Gauge, PlusCircle, TriangleAlert, UsersRound, X } from "lucide-react";
import { Suspense, type CSSProperties } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { StatKpi } from "@/components/ui/stat-kpi";
import { TriageStrip, type TriageStripTone } from "@/components/ui/triage-strip";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { createCalibrationSession, updateCalibrationSessionStatus } from "@/lib/calibration-actions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatQualityScore } from "@/lib/score-display";

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

function statusTone(status: string): ChipTone {
  if (status === "completed") {
    return "success";
  }

  if (status === "active") {
    return "accent";
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
        scorecard: true,
        participants: { include: { user: true }, orderBy: { createdAt: "asc" } },
        items: {
          include: {
            conversation: {
              include: {
                reviews: { include: { reviewer: true } },
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
        missingParticipants
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
  const calibrationNextAction = !selectedSession
    ? "Создайте первую сессию из финализированных проверок."
    : selectedItemCount === 0
      ? "Добавьте обращения, чтобы участники оценивали один и тот же набор."
      : selectedParticipantCount === 0
        ? "Добавьте проверяющих в сессию."
        : selectedWaitingCount > 0
          ? `Дождитесь или напомните ${selectedWaitingCount} оценок перед разбором.`
          : selectedDisagreementCount > 0
            ? `Разберите ${selectedDisagreementCount} расхождений и зафиксируйте общее правило.`
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
      <Link
        href={`/reviews/${selectedFirstOpenItem.conversationId}?reviewSource=CALIBRATION&returnTo=${encodeURIComponent(`/calibration?session=${selectedSession.id}`)}`}
        className="action-button action-button--primary"
      >
        Разобрать
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    ) : undefined;

  return (
    <PageShell
      eyebrow="Контроль качества"
      title="Калибровка"
      description="Проверяющие оценивают одни и те же обращения. Руководитель видит расхождения и фиксирует единое правило."
      actions={
        <Link href={openNewSession ? closeNewSessionHref : newSessionHref} className={`action-button ${openNewSession ? "" : "action-button--primary"}`}>
          {openNewSession ? <X size={18} aria-hidden="true" /> : <PlusCircle size={18} aria-hidden="true" />}
          {openNewSession ? "Скрыть форму" : "Новая сессия"}
        </Link>
      }
    >
      <div className="grid gap-[14px] items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <TriageStrip
        tone={calibrationTriageTone}
        icon={selectedDisagreementCount > 0 ? <TriangleAlert size={18} aria-hidden="true" /> : <Crosshair size={18} aria-hidden="true" />}
        title={
          selectedSession
            ? selectedDisagreementCount > 0
              ? `${selectedDisagreementCount} ${selectedDisagreementCount === 1 ? "расхождение требует" : "расхождений требуют"} разбора`
              : selectedWaitingCount > 0
                ? `${selectedWaitingCount} ${selectedWaitingCount === 1 ? "оценка ещё ждёт" : "оценок ещё ждут"}`
                : "Сессия готова к разбору"
            : "Нет активной калибровки"
        }
        description={calibrationNextAction}
        action={calibrationTriageAction}
      />

      <div className="enablement-kpi-grid" aria-label="Ключевые показатели калибровки">
        <StatKpi
          label="Согласованность"
          value={selectedAlignmentPercent != null ? selectedAlignmentPercent : "—"}
          unit={selectedAlignmentPercent != null ? "%" : undefined}
          tone={selectedAlignmentPercent != null && selectedAlignmentPercent < 85 ? "warning" : "neutral"}
          icon={<Crosshair size={16} aria-hidden="true" />}
          hint={selectedAlignmentPercent != null ? "Цель — 85–90% в пределах ±10" : "Появится после оценок участников"}
        />
        <StatKpi
          label="Готовность"
          value={selectedProgress}
          unit="%"
          icon={<Gauge size={16} aria-hidden="true" />}
          hint={selectedWaitingCount > 0 ? `${selectedWaitingCount} оценок ещё ждут` : "Все оценки собраны"}
        />
        <StatKpi
          label="Расхождения"
          value={selectedDisagreementCount}
          tone={selectedDisagreementCount > 0 ? "warning" : "neutral"}
          icon={<TriangleAlert size={16} aria-hidden="true" />}
          hint={selectedDisagreementCount > 0 ? `Разброс выше ±${ALIGNMENT_BAND} баллов` : "Оценки в пределах нормы"}
        />
        <StatKpi
          label="Активных сессий"
          value={activeSessionCount}
          icon={<ClipboardCheck size={16} aria-hidden="true" />}
          hint={`${sessions.length} всего в рабочей области`}
        />
      </div>
      </div>

      {openNewSession ? (
        <section className="calibration-create-panel workflow-create-panel calibration-create-inline" aria-label="Новая калибровка">
          <div className="learning-section-header calibration-create-form__header">
            <div className="min-w-0">
              <h2>Новая калибровка</h2>
              <p>Выберите проверяющих и обращения. После создания участники получат один и тот же набор для оценки.</p>
            </div>
            <Link href={closeNewSessionHref} className="action-button">
              Скрыть
            </Link>
          </div>
          <form action={createCalibrationSession} className="calibration-create-form">
            <div className="calibration-create-shell">
              <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
                Название
                <input name="name" required defaultValue="Калибровка недели" className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
                Срок
                <input name="dueAt" type="date" className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
                Заметки
                <textarea name="notes" rows={2} className="form-control" />
              </label>
            </div>

            <div className="calibration-create-columns">
              <fieldset className="form-stack">
                <legend className="text-sm font-semibold text-[var(--foreground)]">Участники</legend>
                <div className="calibration-picker-grid">
                  {qaUsers.map((qaUser) => (
                    <label key={qaUser.id} className="compact-check-card">
                      <input name="participantId" type="checkbox" value={qaUser.id} defaultChecked={qaUser.id === user.id} />
                      <span>{qaUser.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="form-stack">
                <legend className="text-sm font-semibold text-[var(--foreground)]">Обращения</legend>
                <div className="calibration-picker-grid calibration-picker-grid--scroll">
                  {conversations.map((conversation) => (
                    <label key={conversation.id} className="compact-check-card compact-check-card--tall">
                      <input name="conversationId" type="checkbox" value={conversation.id} />
                      <span>
                        <strong>{conversation.externalId}</strong>
                        {conversation.subject}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <ValidatedSubmitButton minCheckedNames={["participantId", "conversationId"]}>
              Создать сессию
            </ValidatedSubmitButton>
          </form>
        </section>
      ) : null}

      <section className="calibration-session-strip panel" aria-label="Сессии калибровки">
        <div className="learning-section-header calibration-session-strip__header">
          <div className="min-w-0">
            <h2>Сессии</h2>
            <p>Выберите сессию, затем разберите ожидания и расхождения.</p>
          </div>
          <Chip tone="neutral" numeric>{sessions.length}</Chip>
        </div>
        <div className="calibration-session-row">
          {sessionSummaries.map((summary) => {
            const isSelected = selectedSession?.id === summary.session.id;

            return (
              <Link
                key={summary.session.id}
                href={calibrationHref({ sessionId: summary.session.id })}
                className={`calibration-session-chip ${isSelected ? "calibration-session-chip--selected" : ""}`}
                aria-current={isSelected ? "page" : undefined}
              >
                <Chip tone={statusTone(summary.session.status)} size="xs">{statusLabel(summary.session.status)}</Chip>
                <strong>{summary.session.name}</strong>
                <small className="calibration-session-chip__stats">
                  <span>{summary.progress}% готово</span>
                  <span>{summary.waitingCount} ждут</span>
                  <span>{summary.disagreementCount} расх.</span>
                </small>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="calibration-workspace" aria-label="Рабочая область калибровки">
        <div className="calibration-board panel">
          {selectedSession ? (
            <>
              <div className="calibration-board__header">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2>{selectedSession.name}</h2>
                    <Chip tone={statusTone(selectedSession.status)} size="sm">{statusLabel(selectedSession.status)}</Chip>
                  </div>
                  <p>
                    {selectedSession.notes || "Сравните оценки по одним обращениям и зафиксируйте, где правило трактуется по-разному."}
                  </p>
                </div>
                <div className="calibration-board__actions">
                  {selectedSession.status === "active" || selectedSession.status === "draft" ? (
                    <form action={updateCalibrationSessionStatus}>
                      <input type="hidden" name="id" value={selectedSession.id} />
                      <input type="hidden" name="status" value="completed" />
                      <button type="submit" className="action-button action-button--primary">
                        <CheckCircle2 size={16} aria-hidden="true" />
                        Завершить
                      </button>
                    </form>
                  ) : selectedSession.status === "completed" || selectedSession.status === "archived" ? (
                    <form action={updateCalibrationSessionStatus}>
                      <input type="hidden" name="id" value={selectedSession.id} />
                      <input type="hidden" name="status" value="active" />
                      <button type="submit" className="action-button">
                        Вернуть в работу
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>

              <div className="calibration-session-meta" aria-label="Параметры сессии калибровки">
                {calibrationDecisionMeta.map((meta) => {
                  const Icon = meta.icon;

                  return (
                    <span key={meta.label} className="calibration-session-meta__item">
                      <Icon size={15} aria-hidden="true" />
                      <small>{meta.label}</small>
                      <strong>{meta.value}</strong>
                    </span>
                  );
                })}
              </div>

              {selectedItemStates.length > 0 && selectedSession.participants.length > 0 ? (
                <div className="calibration-matrix" aria-label="Согласованность по участникам и обращениям">
                  <div className="learning-section-header calibration-matrix__header">
                    <div className="min-w-0">
                      <h2>Матрица согласованности</h2>
                      <p>Отклонение каждого участника от эталона по каждому обращению. Чем темнее, тем дальше от ±{ALIGNMENT_BAND}. Нижняя строка — среднее смещение участника.</p>
                    </div>
                  </div>
                  <div className="calibration-matrix__scroll">
                    <table className="calibration-matrix__table">
                      <thead>
                        <tr>
                          <th scope="col" className="calibration-matrix__corner">Обращение</th>
                          {selectedSession.participants.map((participant) => (
                            <th key={participant.id} scope="col" className="calibration-matrix__participant">
                              <span className="calibration-avatar" aria-hidden="true">{initialsOf(participant.user.name)}</span>
                              <span className="calibration-matrix__participant-name">{participant.user.name}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedItemStates.map((state) => (
                          <tr key={state.item.id}>
                            <th scope="row" className="calibration-matrix__row-label">
                              <span>{state.item.conversation.subject}</span>
                              <small>{state.alignmentPercent != null ? `${state.alignmentPercent}% в норме` : "нет эталона"}</small>
                            </th>
                            {selectedSession.participants.map((participant) => {
                              const delta = state.reviewerDeltas.get(participant.userId);

                              if (delta == null) {
                                return (
                                  <td key={participant.id} className="calibration-matrix__cell calibration-matrix__cell--empty">
                                    <span aria-hidden="true">·</span>
                                    <span className="sr-only">нет оценки</span>
                                  </td>
                                );
                              }

                              const magnitude = Math.min(Math.abs(delta), 40);
                              const intensity = (magnitude / 40).toFixed(2);
                              const outOfBand = Math.abs(delta) > ALIGNMENT_BAND;

                              return (
                                <td
                                  key={participant.id}
                                  className={`calibration-matrix__cell ${outOfBand ? "calibration-matrix__cell--out" : ""}`}
                                  style={{ "--cell-intensity": intensity } as CSSProperties}
                                  title={`${participant.user.name}: ${signedDelta(delta)} от эталона`}
                                >
                                  {signedDelta(delta)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                      {participantBiasRows.length > 0 ? (
                        <tfoot>
                          <tr className="calibration-matrix__summary-row">
                            <th scope="row" className="calibration-matrix__row-label calibration-matrix__summary-label">
                              <span>Среднее смещение</span>
                              <small>отклонение от эталона</small>
                            </th>
                            {selectedSession.participants.map((participant) => {
                              const averageDelta = participantBiasById.get(participant.id);

                              if (averageDelta == null) {
                                return (
                                  <td key={participant.id} className="calibration-matrix__cell calibration-matrix__cell--empty">
                                    <span aria-hidden="true">·</span>
                                    <span className="sr-only">нет оценки</span>
                                  </td>
                                );
                              }

                              const outOfBand = Math.abs(averageDelta) > ALIGNMENT_BAND;

                              return (
                                <td
                                  key={participant.id}
                                  className={`calibration-matrix__cell calibration-matrix__summary-cell ${outOfBand ? "calibration-matrix__cell--out" : ""}`}
                                  title={
                                    averageDelta === 0
                                      ? `${participant.user.name}: в пределах эталона`
                                      : averageDelta > 0
                                        ? `${participant.user.name}: мягче эталона на ${averageDelta}`
                                        : `${participant.user.name}: строже эталона на ${Math.abs(averageDelta)}`
                                  }
                                >
                                  {signedDelta(averageDelta)}
                                </td>
                              );
                            })}
                          </tr>
                        </tfoot>
                      ) : null}
                    </table>
                  </div>
                </div>
              ) : null}

              <div className="calibration-consensus-list" aria-label="Согласованность по обращениям">
                <div className="learning-section-header">
                  <div className="min-w-0">
                    <h2>Консенсус по обращениям</h2>
                    <p>Доля оценок в пределах ±{ALIGNMENT_BAND} баллов от эталона. Откройте обращение, чтобы зафиксировать общее правило.</p>
                  </div>
                  <Chip tone="neutral" numeric>{selectedItemStates.length}</Chip>
                </div>
                {selectedItemStates.map(({ item, baselineReview, baselineScore, reviews, reviewerDeltas, alignedCount, gradedCount, alignmentPercent, spread, missingParticipants }) => {
                  const completedCount = reviews.length;
                  const expectedCount = selectedSession.participants.length;
                  const attention = spread != null && spread > ALIGNMENT_BAND;
                  const waiting = missingParticipants.length > 0;
                  const offBandCount = Math.max(gradedCount - alignedCount, 0);
                  const alignedPct = gradedCount > 0 ? (alignedCount / gradedCount) * 100 : 0;
                  const offBandPct = gradedCount > 0 ? (offBandCount / gradedCount) * 100 : 0;

                  return (
                    <article
                      key={item.id}
                      className={`calibration-consensus-card ${attention ? "calibration-consensus-card--attention" : ""}`}
                    >
                      <div className="calibration-consensus-card__main">
                        <div className="calibration-consensus-card__head">
                          <Link href={`/reviews/${item.conversationId}`} className="record-title calibration-consensus-card__title">
                            {item.conversation.subject}
                          </Link>
                          {attention ? (
                            <Chip tone="warning" size="xs" numeric label="Разброс" value={spread != null ? formatQualityScore(spread) : "—"} />
                          ) : null}
                        </div>

                        <div className="calibration-consensus">
                          <div className="calibration-consensus__bar-row">
                            <span className="calibration-consensus__headline">
                              <strong>Согласованность</strong>
                              <span className="calibration-consensus__percent">{alignmentPercent != null ? `${alignmentPercent}%` : "нет эталона"}</span>
                            </span>
                            {baselineScore != null ? (
                              <span className="calibration-consensus__baseline">
                                Эталон {baselineScore} · {baselineReview?.reviewer.name}
                              </span>
                            ) : (
                              <span className="calibration-consensus__baseline calibration-consensus__baseline--missing">нет финальной проверки</span>
                            )}
                          </div>
                          {gradedCount > 0 ? (
                            <div
                              className="calibration-consensus__bar"
                              role="img"
                              aria-label={`${alignedCount} из ${gradedCount} в пределах ±${ALIGNMENT_BAND}`}
                            >
                              <span className="calibration-consensus__bar-aligned" style={{ width: `${alignedPct}%` }} />
                              <span className="calibration-consensus__bar-off" style={{ width: `${offBandPct}%` }} />
                            </div>
                          ) : (
                            <div className="calibration-consensus__bar calibration-consensus__bar--empty" aria-hidden="true" />
                          )}
                          <div className="calibration-consensus__legend">
                            <span>{alignedCount} в норме</span>
                            {offBandCount > 0 ? <span className="calibration-consensus__legend-off">{offBandCount} вне ±{ALIGNMENT_BAND}</span> : null}
                            <span>Готово {completedCount}/{expectedCount}</span>
                            {item.conversation._count.coachingPins > 0 ? <span>Заметки {item.conversation._count.coachingPins}</span> : null}
                          </div>
                        </div>

                        <div className="calibration-graders" aria-label="Оценки участников">
                          {selectedSession.participants.map((participant) => {
                            const review = reviews.find((candidate) => candidate.reviewerId === participant.userId);
                            const delta = reviewerDeltas.get(participant.userId);
                            const outOfBand = delta != null && Math.abs(delta) > ALIGNMENT_BAND;

                            return (
                              <span
                                key={participant.id}
                                className={`calibration-grader ${review ? "" : "calibration-grader--waiting"} ${outOfBand ? "calibration-grader--out" : ""}`}
                                title={
                                  review
                                    ? `${participant.user.name}: ${formatQualityScore(review.totalScore)}${delta != null ? ` (${signedDelta(delta)})` : ""}`
                                    : `${participant.user.name}: ждёт оценки`
                                }
                              >
                                <span className="calibration-avatar" aria-hidden="true">{initialsOf(participant.user.name)}</span>
                                <span className="calibration-grader__score">
                                  {review ? Math.round(review.totalScore) : "—"}
                                  {delta != null ? <small>{signedDelta(delta)}</small> : null}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="calibration-consensus-card__aside">
                        {selectedSession.status === "active" || selectedSession.status === "draft" ? (
                          <Link
                            href={`/reviews/${item.conversationId}?reviewSource=CALIBRATION&returnTo=${encodeURIComponent(`/calibration?session=${selectedSession.id}`)}`}
                            className="action-button"
                          >
                            Оценить
                          </Link>
                        ) : (
                          <Chip tone="neutral" size="xs">{selectedSession.status === "archived" ? "Архив" : "Завершена"}</Chip>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<ClipboardCheck size={24} aria-hidden="true" />}
              title="Нет калибровок"
              description="Создайте первую сессию из проверенных обращений и выберите участников."
              action={
                <Link href={newSessionHref} className="action-button action-button--primary">
                  <PlusCircle size={16} aria-hidden="true" />
                  Новая сессия
                </Link>
              }
            />
          )}
        </div>
      </section>
    </PageShell>
  );
}
