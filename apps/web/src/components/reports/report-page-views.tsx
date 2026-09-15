import Link from "next/link";
import { AlertTriangle, ArrowRight, BarChart3, CircleCheck } from "lucide-react";
import {
  AiAgreementPanel,
  AiDriftPanel,
  CriterionHeatmapPanel
} from "@/components/reports/analytics-intelligence";
import { CriterionMatrix } from "@/components/reports/criterion-matrix";
import {
  ChartPanel,
  QuotaProgressBars,
  RankedList,
  ScoreDistributionPanel,
  StackedBar
} from "@/components/reports/report-charts";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { TriageStrip, type TriageStripTone } from "@/components/ui/triage-strip";
import { ReportEvidenceSheet } from "@/components/reports/report-evidence-sheet";
import { ReportParameterLens } from "@/components/reports/report-parameter-lens";
import { ReportKpiRow } from "@/components/reports/report-kpi-row";
import {
  DetailsIndexPanel,
  InsightSummary,
  PeriodMovementPanel,
  ProcessSummary,
  ReportFocusPanel
} from "@/components/reports/report-panels";
import { PrimaryScorePanel } from "@/components/reports/report-score-panel";
import { BreakdownTable, QuotaTable } from "@/components/reports/report-tables";
import { QaCsatMatrixPanel, ReasonTrendPanel, SentimentCorrelationPanel } from "@/components/reports/insight-correlation-panels";
import { StatCard } from "@/components/ui/stat-card";
import { formatQualityScore } from "@/lib/score-display";
import {
  buildReportAnalysisHref,
} from "@/lib/reports/report-analysis-state";
import {
  formatAverageScore,
  formatPeriod,
  formatReviewCount,
  reportHref,
  reportReviewHref
} from "@/lib/reports/report-format";
import { withScoreDeltas } from "@/lib/reports/report-aggregation";
import type { ReportPageModel } from "@/lib/reports/load-report-page-model";

function formatAckDuration(hours: number) {
  return hours < 48
    ? `${Math.max(1, Math.round(hours))} ч`
    : `${(hours / 24).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} дн`;
}

function triageIconForTone(triageTone: TriageStripTone) {
  return triageTone === "danger" || triageTone === "warning"
    ? AlertTriangle
    : triageTone === "success"
      ? CircleCheck
      : BarChart3;
}

export function ReportPageViews(props: ReportPageModel) {
  const {
    period,
    currentReportHref,
    analysisState,
    filterCatalog,
    savedReportViews,
    evidenceResult,
    defaultEvidence,
    defaultEvidenceLink,
    evidenceFocusHeadingId,
    triageTone,
    reportAction,
    reportView,
    scoreHero,
    scoreUnit,
    scoreDeltaChip,
    finalizedCount,
    previousReviews,
    previousAverageScore,
    metricInsightItems,
    averageScore,
    sourceRows,
    focusItems,
    qualityTrendModel,
    visibleTrendSeries,
    chartView,
    currentChartHref,
    deteriorationItems,
    improvementItems,
    driverStackItems,
    performanceFocusItems,
    scoreDistributionBundle,
    criticalCount,
    reanswerCount,
    appealCount,
    hasEntityFilters,
    matrixColumns,
    matrixRows,
    matrixTeamAverage,
    aiAgreement,
    aiAgreementBundle,
    aiDrift,
    aiDriftBundle,
    operatorRankRows,
    sourceRankRows,
    teamRankRows,
    criterionHeatmapRows,
    quotaProgressRows,
    riskStackSegments,
    categoryRows,
    criticalCategoryRows,
    reasonTrendItems,
    reasonTimelineBundle,
    medianAckHours,
    ackWithin48Percent,
    pendingFeedbackCount,
    feedbackRows,
    appealRows,
    reanswerRows,
    sentimentCorrelation,
    qaCsatMatrix,
    qaCsatCellHrefs,
    detailsIndexItems,
    blockScoreRows,
    previousBlockScoreRows,
    quotas,
    finalizedReviews,
    previousSourceRows,
    assigneeRows,
    previousAssigneeRows,
    teamRows,
    previousTeamRows,
    reviewerRows,
    samplingRows,
    csatRows,
    csatScoreRows,
    riskRows
  } = props;

  const resolvedEvidenceIdentity =
    analysisState.evidenceType && analysisState.evidenceKey
      ? `${analysisState.evidenceType}:${analysisState.evidenceKey}`
      : null;
  const TriageIcon = triageIconForTone(triageTone);

  return (
    <>
    <ReportParameterLens
      currentHref={currentReportHref}
      state={analysisState}
      catalog={filterCatalog}
      savedViews={savedReportViews}
    />

    <ReportEvidenceSheet
      evidence={evidenceResult}
      open={Boolean(
        analysisState.evidenceType && analysisState.evidenceKey
      )}
      resolvedEvidenceIdentity={
        resolvedEvidenceIdentity
      }
      defaultEvidence={defaultEvidence}
      openHref={defaultEvidenceLink?.href ?? currentReportHref}
      closeHref={currentReportHref}
      chartHeadingId={evidenceFocusHeadingId}
    >
      {defaultEvidenceLink ? (
        <Button variant="outline" size="sm" className="self-start">
          Показать данные выбранного среза
        </Button>
      ) : undefined}
    </ReportEvidenceSheet>

    <TriageStrip
      tone={triageTone}
      icon={<TriageIcon size={18} aria-hidden="true" />}
      title={reportAction.title}
      description={reportAction.description}
      action={
        <Link
          href={reportAction.href}
          prefetch={false}
          className={cn(buttonVariants({ size: "sm" }))}
        >
          <span>{reportAction.label}</span>
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Link>
      }
    />

    {reportView === "overview" ? (
      <>
        <ReportKpiRow
          scoreLabel="Средняя оценка"
          scoreValue={scoreHero}
          scoreUnit={scoreUnit}
          scoreDelta={scoreDeltaChip}
          scoreHint={
            previousAverageScore == null
              ? `${formatReviewCount(finalizedCount)} · нет базы сравнения`
              : `${formatReviewCount(finalizedCount)} · было ${formatAverageScore(previousAverageScore)}`
          }
          scoreHref={reportReviewHref(period)}
          items={metricInsightItems}
        />

        <InsightSummary
          averageScore={averageScore}
          finalizedCount={finalizedCount}
          previousCount={previousReviews.length}
          topSource={sourceRows[0]}
          period={period}
          focusItems={focusItems}
        />
      </>
    ) : null}

    {reportView === "overview" ? (
      // Overview stays decision-first: one trend + one triage column.
      // Distribution / sentiment / CSAT live in deeper views.
      <section
        aria-label="Динамика качества и факторы"
        className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      >
        <PrimaryScorePanel
          finalizedCount={finalizedCount}
          previousCount={previousReviews.length}
          model={qualityTrendModel}
          visibleSeries={visibleTrendSeries}
          view={chartView}
          currentHref={currentChartHref}
          periodLabel={formatPeriod(period)}
        />
        <PeriodMovementPanel
          negativeItems={deteriorationItems}
          positiveItems={improvementItems}
          driverItems={driverStackItems}
          view={chartView}
          currentHref={currentChartHref}
          periodLabel={formatPeriod(period)}
        />
      </section>
    ) : null}

    {reportView === "overview" ? (
      <section
        aria-label="Углубить анализ"
        className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-3"
      >
        <div className="min-w-0 md:col-span-3">
          <h2 className="text-sm font-semibold text-foreground">Углубить анализ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Обзор отвечает «что происходит». Детали — в соседних видах.
          </p>
        </div>
        <Link
          href={buildReportAnalysisHref(currentReportHref, { view: "performance" }, filterCatalog)}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Исполнение · кого коучить
        </Link>
        <Link
          href={buildReportAnalysisHref(currentReportHref, { view: "process" }, filterCatalog)}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Процесс · риски и причины
        </Link>
        <Link
          href={buildReportAnalysisHref(currentReportHref, { view: "details" }, filterCatalog)}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Разрезы · таблицы и CSAT
        </Link>
      </section>
    ) : null}

    {reportView === "performance" ? (
      <ReportFocusPanel
        kicker="Исполнение"
        title="Что тянет оценку вниз"
        description="Операторы, источники, блоки критериев и план проверок в одном рабочем срезе."
        actionHref={reportReviewHref(period)}
        actionLabel="Открыть очередь"
        items={performanceFocusItems}
      />
    ) : null}

    {reportView === "performance" ? (
      <ScoreDistributionPanel
        bundle={scoreDistributionBundle}
        view={chartView}
        currentHref={currentChartHref}
        periodLabel={formatPeriod(period)}
      />
    ) : null}

    {reportView === "process" ? (
      <ProcessSummary criticalCount={criticalCount} reanswerCount={reanswerCount} appealCount={appealCount} period={period} />
    ) : null}

    {reportView === "performance" ? (
      <Card className="overflow-hidden" aria-labelledby="criterion-matrix-title">
        <CardHeader className="border-b">
          <div className="min-w-0 flex flex-col gap-1">
            <CardDescription>Матрица</CardDescription>
            <CardTitle id="criterion-matrix-title">Операторы × критерии</CardTitle>
            <p className="text-sm text-muted-foreground">
              Pass-rate по блокам критериев для каждого оператора. Закрепленная строка — среднее по команде; слабые операторы и блоки подняты выше.
            </p>
          </div>
          <CardAction>
            <Link
              href={reportHref(period, { view: "details" })}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Таблицы
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="pt-(--card-spacing)">
          <CriterionMatrix
            columns={matrixColumns}
            rows={matrixRows}
            teamAverage={matrixTeamAverage}
            scrollRegionLabelledBy="criterion-matrix-title"
          />
        </CardContent>
      </Card>
    ) : null}

    {reportView === "performance" && hasEntityFilters ? (
      <Card>
        <CardHeader>
          <CardDescription>AI-аналитика</CardDescription>
          <CardTitle>Недоступна для активного среза</CardTitle>
          <p className="text-sm text-muted-foreground">
            Согласие и дрейф AI рассчитываются только для выборки всего
            пространства. Сбросьте фильтры команды, источника, риска и блока.
          </p>
        </CardHeader>
      </Card>
    ) : null}

    {reportView === "performance" && !hasEntityFilters ? (
      <AiAgreementPanel
        report={aiAgreement}
        bundle={aiAgreementBundle}
        view={chartView}
        currentHref={currentChartHref}
        periodLabel={formatPeriod(period)}
      />
    ) : null}

    {reportView === "performance" && !hasEntityFilters ? (
      <AiDriftPanel
        report={aiDrift}
        bundle={aiDriftBundle}
        view={chartView}
        currentHref={currentChartHref}
        periodLabel={formatPeriod(period)}
      />
    ) : null}

    {reportView === "performance" ? (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChartPanel title="По операторам" description="Нижние средние оценки первыми." actionHref={reportReviewHref(period)} actionLabel="Разобрать">
          <RankedList rows={operatorRankRows} valueFormatter={formatQualityScore} actionLabel="Открыть" />
        </ChartPanel>
        <ChartPanel title="По источникам" description="Средняя оценка по системам-источникам." actionHref={reportReviewHref(period)} actionLabel="Открыть">
          <RankedList rows={sourceRankRows} valueFormatter={formatQualityScore} actionLabel="Открыть" />
        </ChartPanel>
        <ChartPanel title="По командам" description="Команды поддержки, где просадка заметна на уровне выборки." actionHref={reportReviewHref(period)} actionLabel="Открыть">
          <RankedList rows={teamRankRows} valueFormatter={formatQualityScore} actionLabel="Открыть" />
        </ChartPanel>
        <CriterionHeatmapPanel
          title="Блоки критериев"
          description="Тепловая карта нормализованных оценок: слабые блоки поднимаются первыми."
          rows={criterionHeatmapRows}
          actionHref={reportHref(period, { view: "details" })}
          actionLabel="Таблица"
        />
        <ChartPanel
          title="Выполнение норм"
          description={
            hasEntityFilters
              ? "Недоступно для активного среза: нормы заданы для полной выборки."
              : "Факт проверок против плана периода."
          }
          actionHref={reportReviewHref(period)}
          actionLabel="Факт"
        >
          <QuotaProgressBars rows={hasEntityFilters ? [] : quotaProgressRows} />
        </ChartPanel>
      </div>
    ) : null}

    {reportView === "process" ? (
      <>
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          <ChartPanel
            title="Профиль рисков"
            description="Доля замечаний по уровню риска."
            actionHref={reportReviewHref(period, { riskLevel: "CRITICAL" })}
            actionLabel="Критические"
          >
            <StackedBar segments={riskStackSegments} />
          </ChartPanel>
          <BreakdownTable title="Категории" rows={categoryRows} countLabel="Замечаний" />
          <BreakdownTable title="Критические ошибки" rows={criticalCategoryRows} countLabel="Ошибок" />
        </div>
        <ReasonTrendPanel
          rows={reasonTrendItems}
          bundle={reasonTimelineBundle}
          view={chartView}
          currentHref={currentChartHref}
          periodLabel={formatPeriod(period)}
        />
        <div className="grid gap-3 sm:grid-cols-3" aria-label="Скорость обратной связи">
          <StatCard
            label="Медиана до ознакомления"
            value={medianAckHours != null ? formatAckDuration(medianAckHours) : "—"}
            hint="Время от финализации до подтверждения"
          />
          <StatCard
            label="Ознакомлены за 48 ч"
            value={ackWithin48Percent != null ? `${ackWithin48Percent}%` : "—"}
            hint="Доля операторов, ответивших за двое суток"
          />
          <StatCard
            label="Ожидают ответа оператора"
            value={pendingFeedbackCount}
            hint="Финализированные проверки без ответа"
          />
        </div>
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          <BreakdownTable title="Обратная связь" rows={feedbackRows} countLabel="Проверок" />
          <BreakdownTable title="Апелляции" rows={appealRows} countLabel="Проверок" />
          <BreakdownTable title="Переответы" rows={reanswerRows} countLabel="Проверок" />
        </div>
      </>
    ) : null}

    {reportView === "details" ? (
      <div className="flex min-w-0 flex-col gap-5">
        <SentimentCorrelationPanel
          correlation={sentimentCorrelation}
          actionHref={reportReviewHref(period)}
        />
        <QaCsatMatrixPanel
          matrix={qaCsatMatrix}
          cellHrefs={qaCsatCellHrefs}
          actionHref={reportReviewHref(period)}
        />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(16rem,0.85fr)_minmax(0,1fr)]">
        <DetailsIndexPanel
          items={detailsIndexItems}
          titleId="details-analysis-title"
        />
        <div className="grid min-w-0 gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <BreakdownTable
            id="details-blocks"
            title="Блоки критериев"
            rows={withScoreDeltas(blockScoreRows, previousBlockScoreRows)}
            countLabel="Оценок"
            showAverage
          />
          {hasEntityFilters ? (
            <Card id="details-quotas" size="sm">
              <CardHeader>
                <CardTitle>Нормы проверок недоступны</CardTitle>
                <CardDescription>
                  Нормы рассчитаны для полной выборки. Сбросьте фильтры
                  команды, источника, риска и блока.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <QuotaTable
              id="details-quotas"
              quotas={quotas}
              reviews={finalizedReviews}
              period={period}
            />
          )}
          <BreakdownTable
            id="details-sources"
            title="Источники"
            rows={withScoreDeltas(sourceRows, previousSourceRows)}
            countLabel="Проверок"
            showAverage
          />
          <BreakdownTable
            id="details-people"
            title="Операторы"
            rows={withScoreDeltas(assigneeRows, previousAssigneeRows)}
            countLabel="Проверок"
            showAverage
          />
          <BreakdownTable
            title="Команды операторов"
            rows={withScoreDeltas(teamRows, previousTeamRows)}
            countLabel="Проверок"
            showAverage
          />
          <BreakdownTable title="Проверяющие" rows={reviewerRows} countLabel="Проверок" showAverage />
          <BreakdownTable id="details-statuses" title="Типы выборки" rows={samplingRows} countLabel="Проверок" />
          <BreakdownTable title="CSAT" rows={csatRows} countLabel="Проверок" />
          <BreakdownTable
            title="Средний балл по CSAT"
            rows={csatScoreRows}
            countLabel="Проверок"
            showAverage
          />
          <BreakdownTable title="Риски" rows={riskRows} countLabel="Замечаний" />
        </div>
      </div>
      </div>
    ) : null}

    </>
  );
}
