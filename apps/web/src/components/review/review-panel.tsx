import type {
  CoachingAction,
  CriterionScore,
  Finding,
  Message,
  Review,
  ReviewSource,
  Scorecard,
  ScorecardCriterion
} from "@prisma/client";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { criterionPredictionChipLabel } from "@/components/review/ai-prediction-chip";
import { EvidencePickerListener } from "@/components/review/evidence-picker-listener";
import { EvidenceJumpLink } from "@/components/review/evidence-jump-link";
import { ReviewKeyboard } from "@/components/review/review-keyboard";
import { ReviewFormShell } from "@/components/review/review-form-shell";
import { SummaryTemplatePicker, type SummaryTemplate } from "@/components/review/summary-template-picker";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { CriterionPrediction } from "@/lib/ai-quality/scoring/types";
import { ownerTypeLabels, riskLevelLabels } from "@/lib/labels";
import { formatQualityScore } from "@/lib/score-display";
import { cn } from "@/lib/utils";

type ReviewPanelProps = {
  conversationId: string;
  messages: Message[];
  scorecard: Scorecard & { criteria: ScorecardCriterion[] };
  draftReview?: (Review & { scores: CriterionScore[]; findings: (Finding & { coachingAction: CoachingAction | null })[] }) | null;
  reviewSource?: ReviewSource;
  returnTo?: string;
  title?: string;
  /**
   * Real per-criterion AI predictions from the latest "score" draft, keyed by
   * criterion id. Absent when no score draft exists (then no AI chip renders).
   */
  aiPredictions?: Record<string, CriterionPrediction>;
};

const categoryTemplates = [
  "Политика возврата",
  "Точность ответа",
  "Эмпатия и тон",
  "Скорость эскалации",
  "Работа с подсказкой ИИ"
];

const coachingTemplates = [
  "Разобрать пример на 1:1 и закрепить корректную формулировку.",
  "Обновить макрос и показать команде эталонный ответ.",
  "Провести короткую калибровку по политике возврата.",
  "Добавить чек перед отправкой ответа клиенту."
];

const summaryTemplates: SummaryTemplate[] = [
  {
    label: "Стандарт",
    value: "Ответ соответствует стандарту: решение дано полно, тон корректный, следующий шаг понятен клиенту."
  },
  {
    label: "Замечание",
    value: "Есть замечание: оператору нужно точнее опираться на регламент и явно фиксировать следующий шаг."
  },
  {
    label: "Критическая ошибка",
    value: "Критическая ошибка: требуется разбор с руководителем и контроль переответа клиенту."
  }
];

const criticalErrorTemplates = [
  "Неверная информация",
  "Неверная маршрутизация с потерей времени",
  "Нарушение времени реакции",
  "Разглашение внутренней информации",
  "Закрытие без решения",
  "Работа без идентификации",
  "Грубое нарушение стиля"
];

/** Visually hidden radio control; segment styling lives on the wrapping label. */
// Visually hide the radio chrome; the surrounding label is the full hit target
// (legacy .segment input clip pattern). Base UI still emits FormData radios.
const segmentRadioClass = cn(
  "sr-only absolute size-px overflow-hidden border-0 p-0 opacity-0 shadow-none",
  "after:hidden focus-visible:ring-0 data-checked:border-transparent data-checked:bg-transparent"
);

// Selected cell uses :has([data-checked]) so it tracks Base UI RadioGroupItem
// (not native :checked), matching workbench accent/danger segment fills.
const segmentSelectedClass = cn(
  "has-[[data-slot=radio-group-item][data-checked]]:bg-primary",
  "has-[[data-slot=radio-group-item][data-checked]]:text-primary-foreground",
  "has-[[data-slot=radio-group-item][data-checked]]:[&_[data-segment-points]]:text-primary-foreground/80"
);

const segmentLabelBaseClass = cn(
  "relative flex min-h-9 min-w-0 cursor-pointer items-center justify-between gap-2.5 border-border bg-card px-2.5 py-1.5 text-foreground transition-colors duration-150",
  "hover:bg-muted",
  segmentSelectedClass,
  "has-[[data-slot=radio-group-item]:focus-visible]:outline",
  "has-[[data-slot=radio-group-item]:focus-visible]:outline-2",
  "has-[[data-slot=radio-group-item]:focus-visible]:-outline-offset-2",
  "has-[[data-slot=radio-group-item]:focus-visible]:outline-primary/35"
);

// SCALE_1_3: stacked full-width rows so long RU labels never clip.
const segmentLabelScaleClass = cn(segmentLabelBaseClass, "border-t first:border-t-0");

// Binary: side-by-side on sm+, stacked on narrow viewports.
const segmentLabelBinaryClass = cn(
  segmentLabelBaseClass,
  "flex-col items-center justify-center gap-0.5 border-t text-center first:border-t-0",
  "sm:border-t-0 sm:border-l sm:first:border-l-0"
);

const segmentLabelDangerClass = cn(
  segmentLabelBinaryClass,
  "has-[[data-slot=radio-group-item][data-checked]]:bg-destructive",
  "has-[[data-slot=radio-group-item][data-checked]]:text-primary-foreground"
);

const nestedDisclosureClass =
  "group overflow-clip rounded-lg border border-border bg-card";

const nestedDisclosureTriggerClass = cn(
  "flex w-full cursor-pointer items-center justify-between gap-3 bg-transparent px-4 py-3 text-left",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
);

const nestedDisclosureBodyClass =
  "grid gap-4 border-t border-border bg-muted/40 p-4 data-closed:hidden";

function isCriterionIssue(criterion: ScorecardCriterion, score?: CriterionScore) {
  if (score?.isNotApplicable) {
    return false;
  }

  if (criterion.kind === "SCALE_1_3") {
    return (score?.value ?? 3) < 3;
  }

  return score?.passed === false;
}

function criterionStatus(criterion: ScorecardCriterion, score?: CriterionScore): { label: string; tone: ChipTone } {
  if (score?.isNotApplicable) {
    return { label: "Не применимо", tone: "neutral" };
  }

  if (criterion.kind === "SCALE_1_3") {
    const value = score?.value ?? 3;

    if (value <= 1) {
      return { label: "1/3 критично", tone: "danger" };
    }

    if (value === 2) {
      return { label: "2/3 доработка", tone: "warning" };
    }

    return { label: "3/3 стандарт", tone: "success" };
  }

  return score?.passed === false
    ? { label: "Незачет", tone: "danger" }
    : { label: "Зачет", tone: "success" };
}

function getCriterionDensityMeta(score?: CriterionScore) {
  const meta: string[] = [];

  if (score?.comment) {
    meta.push("комментарий");
  }

  return meta;
}

/**
 * Whether the human draft verdict matches the real AI prediction for this
 * criterion. Used to flip the AI chip to the quiet "ИИ согласен" state and
 * to decide the indigo override border. Returns `false` when either side is
 * unscored/non-applicable so a real disagreement is never hidden.
 */
function aiAgreesWithDraft(
  criterion: ScorecardCriterion,
  prediction: CriterionPrediction,
  score?: CriterionScore
) {
  if (score?.isNotApplicable || prediction.isNotApplicable) {
    return Boolean(score?.isNotApplicable) && Boolean(prediction.isNotApplicable);
  }

  if (criterion.kind === "SCALE_1_3") {
    if (typeof prediction.value !== "number") {
      return false;
    }
    return (score?.value ?? 3) === prediction.value;
  }

  if (typeof prediction.passed !== "boolean") {
    return false;
  }
  return (score?.passed ?? true) === prediction.passed;
}

function formatEvidenceTime(value: Date) {
  return value.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function shouldOpenCriterion(criterion: ScorecardCriterion, score?: CriterionScore) {
  if (criterion.order === 1) {
    return true;
  }

  return Boolean(
    score?.comment ||
      score?.evidenceMessageId ||
      score?.isNotApplicable ||
      score?.passed === false ||
      (criterion.kind === "SCALE_1_3" && score?.value != null && score.value < 3)
  );
}

function StepHeader({ number, title, detail }: { number: number; title: string; detail: string }) {
  return (
    <div className="step-header flex min-w-0 items-start gap-2.5">
      <span className="step-header__number flex size-[26px] shrink-0 items-center justify-center rounded-md border border-border bg-card text-xs font-extrabold tabular-nums text-muted-foreground">
        {number}
      </span>
      <div className="min-w-0">
        <h3 className="text-xs font-extrabold uppercase leading-tight text-muted-foreground">{title}</h3>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function StepDisclosure({
  number,
  title,
  detail,
  children,
  className,
  defaultOpen = true
}: {
  number: number;
  title: string;
  detail: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn("work-section group flex flex-col gap-3", className)}
    >
      <CollapsibleTrigger className="flex w-full min-w-0 cursor-pointer items-start justify-between gap-2.5 bg-transparent text-left outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring/50">
        <StepHeader number={number} title={title} detail={detail} />
        <span
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary transition-transform duration-150 group-data-open:rotate-180"
          aria-hidden="true"
        >
          <ChevronDown className="size-4" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent keepMounted className="min-w-0 data-closed:hidden">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function NestedDisclosure({
  title,
  detail,
  defaultOpen,
  id,
  children
}: {
  title: string;
  detail: string;
  defaultOpen: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible id={id} defaultOpen={defaultOpen} className={nestedDisclosureClass}>
      <CollapsibleTrigger className={nestedDisclosureTriggerClass}>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-primary transition-transform duration-150 group-data-open:rotate-180"
          aria-hidden="true"
        >
          <ChevronDown className="size-4" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent keepMounted className={nestedDisclosureBodyClass}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ReviewPanel({
  conversationId,
  messages,
  scorecard,
  draftReview,
  reviewSource = "HUMAN",
  returnTo,
  title = "Проверка",
  aiPredictions
}: ReviewPanelProps) {
  const draftScores = new Map(draftReview?.scores.map((score) => [score.criterionId, score]) ?? []);
  const draftFinding = draftReview?.findings[0];
  const hasOptionalDetails = Boolean(
    draftFinding?.rootCause ||
      draftFinding?.evidenceSummary ||
      draftFinding?.coachingAction ||
      draftReview?.criticalError ||
      draftReview?.needsReanswer ||
      draftReview?.feedbackComment ||
      draftReview?.positiveNotes ||
      draftReview?.instructionLinks
  );
  const hasCriticalDetails = Boolean(
    draftReview?.criticalError || draftReview?.needsReanswer || draftReview?.criticalCategory
  );
  const hasFeedbackDetails = Boolean(
    draftReview?.feedbackComment || draftReview?.positiveNotes || draftReview?.instructionLinks
  );
  const hasAnalysisDetails = Boolean(
    draftFinding?.rootCause ||
      draftFinding?.evidenceSummary ||
      draftFinding?.coachingAction ||
      draftReview?.calibrationNotes
  );
  const criteriaByBlock = scorecard.criteria.reduce<Array<{ block: string; criteria: ScorecardCriterion[] }>>((groups, criterion) => {
    const lastGroup = groups[groups.length - 1];

    if (lastGroup?.block === criterion.block) {
      lastGroup.criteria.push(criterion);
    } else {
      groups.push({ block: criterion.block, criteria: [criterion] });
    }

    return groups;
  }, []);

  const messageById = new Map(messages.map((message) => [message.id, message]));
  const totalWeight = scorecard.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  const answeredCount = scorecard.criteria.filter((criterion) => {
    const score = draftScores.get(criterion.id);
    return Boolean(score) && !score?.isNotApplicable;
  }).length;
  const scoredCount = scorecard.criteria.filter((criterion) => !draftScores.get(criterion.id)?.isNotApplicable).length;

  /** Per-answer contribution of a criterion toward the 100-point final score. */
  function criterionContribution(criterion: ScorecardCriterion, score?: CriterionScore) {
    if (totalWeight <= 0 || score?.isNotApplicable) {
      return 0;
    }

    if (criterion.kind === "SCALE_1_3") {
      const value = score?.value ?? 3;
      return (criterion.weight * (value / 3) * 100) / totalWeight;
    }

    const passed = score?.passed ?? true;
    return passed ? (criterion.weight * 100) / totalWeight : 0;
  }

  function formatPercent(value: number) {
    return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
  }

  return (
    <ReviewFormShell className="review-panel-form panel overflow-clip bg-card">
      <EvidencePickerListener />
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="scorecardId" value={scorecard.id} />
      <input type="hidden" name="reviewSource" value={reviewSource} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <div className="border-b border-border bg-card px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold leading-tight text-foreground">{title}</h2>
            <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
              {scorecard.name} v{scorecard.version}
            </p>
          </div>
          <Badge variant="secondary" className="tabular-nums" aria-label="Прогресс заполнения">
            {answeredCount} / {scoredCount}
          </Badge>
        </div>
      </div>

      {/* Live score math: the running final score is the hero numeral; weight and
          progress sit beside it. Filled by the saved draft total until re-saved.
          A section-weight bar below shows how the 100 points split across process
          groups (single indigo hue, hairline segments). */}
      <section className="review-score-surface grid gap-3 bg-muted px-4 py-3.5">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-[18px] gap-y-3">
          <div className="grid min-w-0 gap-0.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              Итоговый балл
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[34px] font-semibold leading-none tabular-nums tracking-tight text-foreground">
                {draftReview?.totalScore != null ? formatQualityScore(draftReview.totalScore) : "—"}
              </span>
              <span className="text-[15px] font-semibold tabular-nums leading-none text-muted-foreground">/ 100</span>
            </div>
            <span className="text-xs leading-snug text-muted-foreground">
              {draftReview?.totalScore != null ? "Из последнего сохранения" : "Появится после сохранения"}
            </span>
          </div>
          <dl className="m-0 flex gap-[18px]">
            <div className="grid gap-0.5">
              <dt className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Сумма весов</dt>
              <dd className="m-0 text-[15px] font-semibold tabular-nums leading-tight text-foreground">{totalWeight}%</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Заполнено</dt>
              <dd className="m-0 text-[15px] font-semibold tabular-nums leading-tight text-foreground">
                {answeredCount} / {scoredCount}
              </dd>
            </div>
          </dl>
        </div>

        {totalWeight > 0 ? (
          <div className="flex h-2 w-full gap-0.5 overflow-clip rounded-full bg-card" role="img" aria-label="Распределение веса по группам критериев">
            {criteriaByBlock.map((group, index) => {
              const groupWeight = group.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
              const share = (groupWeight / totalWeight) * 100;

              return (
                <span
                  key={group.block}
                  className={cn(
                    "h-full min-w-[3px] rounded-sm bg-primary",
                    index % 3 === 1 && "bg-primary/70",
                    index % 3 === 2 && "bg-primary/50"
                  )}
                  style={{ width: `${share}%` }}
                  title={`${group.block} · ${groupWeight}%`}
                />
              );
            })}
          </div>
        ) : null}

        <div
          className={cn(
            "flex items-center justify-between gap-2.5 rounded-md border border-border bg-card px-2.5 py-2",
            draftReview?.criticalError && "border-destructive/40 bg-destructive/10"
          )}
          data-active={draftReview?.criticalError ? "true" : undefined}
        >
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
            Критическая ошибка
          </span>
          <span
            className={cn(
              "text-right text-[13px] font-bold leading-tight text-foreground",
              draftReview?.criticalError && "text-destructive"
            )}
          >
            {draftReview?.criticalError ? draftReview.criticalCategory ?? "Выявлена" : "Не выявлена"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={draftReview?.needsReanswer ? "warning" : "neutral"}>
            {draftReview?.needsReanswer ? "Нужен переответ" : "Переответ не нужен"}
          </Chip>
          <Chip tone={draftFinding?.category ? "accent" : "neutral"}>
            {draftFinding?.category ?? "Категория не выбрана"}
          </Chip>
        </div>
      </section>

      <div className="review-panel-scroll bg-muted">
        <StepDisclosure
          number={1}
          title="Оценка по критериям"
          detail="Заполните только то, что отличается от нормы."
          className="work-section--muted p-3.5"
        >
          <div className="grid gap-3">
            {criteriaByBlock.map((group) => {
              const groupWeight = group.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
              const issueCount = group.criteria.filter((criterion) => isCriterionIssue(criterion, draftScores.get(criterion.id))).length;
              const evidenceCount = group.criteria.filter((criterion) => draftScores.get(criterion.id)?.evidenceMessageId).length;
              const commentCount = group.criteria.filter((criterion) => draftScores.get(criterion.id)?.comment).length;
              const skippedCount = group.criteria.filter((criterion) => draftScores.get(criterion.id)?.isNotApplicable).length;

              return (
                <section key={group.block} className="overflow-clip rounded-lg border border-border bg-card">
                  <header className="flex min-w-0 flex-col items-start justify-between gap-2.5 border-b border-border bg-muted/70 px-3 py-2.5 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <span className="block text-[10px] font-extrabold uppercase leading-none text-muted-foreground">
                        Группа процесса
                      </span>
                      <h4 className="mt-0.5 truncate text-sm font-bold leading-tight text-foreground">{group.block}</h4>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center justify-start gap-1.5 sm:justify-end">
                      <Chip tone={issueCount > 0 ? "warning" : "success"}>
                        {issueCount > 0 ? `${issueCount} замеч.` : "без замечаний"}
                      </Chip>
                      {evidenceCount > 0 ? (
                        <Chip tone="info">
                          {evidenceCount} доказ.
                        </Chip>
                      ) : null}
                      {commentCount > 0 ? (
                        <Chip tone="accent">
                          {commentCount} комм.
                        </Chip>
                      ) : null}
                      {skippedCount > 0 ? (
                        <Chip tone="neutral">
                          {skippedCount} Н/П
                        </Chip>
                      ) : null}
                      <Badge variant="outline" className="tabular-nums" title="Суммарный вес группы в итоговом балле">
                        Вес {groupWeight}%
                      </Badge>
                    </div>
                  </header>

                  <div className="grid gap-0 bg-card">
                    {group.criteria.map((criterion) => {
                      const draftScore = draftScores.get(criterion.id);
                      const passedValue = draftScore?.passed ?? true;
                      const status = criterionStatus(criterion, draftScore);
                      const densityMeta = getCriterionDensityMeta(draftScore);
                      const hasIssue = isCriterionIssue(criterion, draftScore);
                      const contribution = criterionContribution(criterion, draftScore);
                      const prediction = aiPredictions?.[criterion.id];
                      const aiAgrees = prediction ? aiAgreesWithDraft(criterion, prediction, draftScore) : false;
                      const evidenceMessage = draftScore?.evidenceMessageId
                        ? messageById.get(draftScore.evidenceMessageId)
                        : undefined;
                      // The active/AI-flagged criterion (a failing one, or one where
                      // the human overrode a real AI prediction) earns the indigo
                      // 1.5px border. Without a prediction only a real issue flags it.
                      const aiFlagged =
                        hasIssue || (Boolean(prediction) && !aiAgrees && !draftScore?.isNotApplicable);

                      return (
                        <Collapsible
                          key={criterion.id}
                          defaultOpen={shouldOpenCriterion(criterion, draftScore)}
                          className={cn(
                            "criterion-card disclosure-panel group overflow-clip border-0 border-t border-border bg-card first:border-t-0",
                            "data-[state=ok]:bg-card",
                            "data-[state=muted]:bg-muted",
                            "data-[state=issue]:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--warning)_7%,transparent),transparent_38%),var(--card)]",
                            "data-open:bg-muted/40",
                            "data-open:data-[state=issue]:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--destructive)_6%,transparent),transparent_40%),var(--card)]",
                            "data-[ai-flag=true]:relative data-[ai-flag=true]:z-[1] data-[ai-flag=true]:my-1.5 data-[ai-flag=true]:rounded-lg data-[ai-flag=true]:border-[1.5px] data-[ai-flag=true]:border-primary/30",
                            "data-[ai-flag=true]:data-[state=issue]:border-[color-mix(in_srgb,var(--primary)_50%,var(--destructive)_22%)]",
                            "data-kbd-focused:relative data-kbd-focused:z-[2] data-kbd-focused:rounded-lg data-kbd-focused:outline data-kbd-focused:outline-2 data-kbd-focused:-outline-offset-2 data-kbd-focused:outline-primary"
                          )}
                          data-criterion-card=""
                          data-criterion-id={criterion.id}
                          data-state={hasIssue ? "issue" : draftScore?.isNotApplicable ? "muted" : "ok"}
                          data-ai-flag={aiFlagged ? "true" : undefined}
                        >
                          <CollapsibleTrigger
                            className={cn(
                              "disclosure-summary grid w-full min-h-[52px] cursor-pointer grid-cols-[28px_minmax(0,1fr)_28px] items-center gap-2.5 bg-transparent px-2.5 py-2 text-left",
                              "outline-none hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring/50"
                            )}
                          >
                            <span className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-muted/80 text-xs font-extrabold tabular-nums text-muted-foreground">
                              {criterion.order}
                            </span>
                            <div className="min-w-0">
                              <div className="flex min-w-0 flex-col items-start justify-between gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                                <h4 className="min-w-0 text-[13px] font-bold leading-snug text-foreground">{criterion.label}</h4>
                                <span className="flex flex-wrap items-center gap-1.5">
                                  {prediction ? (
                                    <Chip
                                      tone="ai"
                                      className={cn(aiAgrees && "opacity-80")}
                                      title={
                                        prediction.rationale
                                          ? `Предсказание ИИ: ${criterionPredictionChipLabel(prediction)} — ${prediction.rationale}`
                                          : `Предсказание ИИ: ${criterionPredictionChipLabel(prediction)}`
                                      }
                                    >
                                      {aiAgrees ? "ИИ согласен" : criterionPredictionChipLabel(prediction)}
                                    </Chip>
                                  ) : null}
                                  <Chip tone={status.tone}>
                                    {status.label}
                                  </Chip>
                                </span>
                              </div>
                              <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-[11px] font-medium leading-tight text-muted-foreground">
                                <span className="font-semibold tabular-nums">Вес {criterion.weight}%</span>
                                <span className="font-semibold tabular-nums text-foreground/80">
                                  Вклад {draftScore?.isNotApplicable ? "Н/П" : formatPercent(contribution)}
                                </span>
                                <span>{criterion.kind === "SCALE_1_3" ? "Шкала 1-3" : "Да/нет"}</span>
                                {evidenceMessage ? (
                                  <EvidenceJumpLink
                                    messageId={evidenceMessage.id}
                                    timeLabel={formatEvidenceTime(evidenceMessage.sentAt)}
                                    className="font-semibold tabular-nums text-primary"
                                  />
                                ) : null}
                                {densityMeta.map((item) => (
                                  <span key={item}>{item}</span>
                                ))}
                              </div>
                            </div>
                            <span
                              className="disclosure-chevron inline-flex size-7 shrink-0 items-center justify-center rounded-md text-primary transition-transform duration-150 group-data-open:rotate-180"
                              aria-hidden="true"
                            >
                              <ChevronDown className="size-4" />
                            </span>
                          </CollapsibleTrigger>

                          <CollapsibleContent
                            keepMounted
                            className="grid gap-2.5 border-t border-border bg-muted/50 p-2.5 data-closed:hidden"
                          >
                            <div className="grid grid-cols-1 items-end gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
                              {criterion.kind === "SCALE_1_3" ? (
                                <FieldSet className="min-w-0 gap-1.5">
                                  <FieldLegend
                                    id={`review-criterion-${criterion.id}-score-legend`}
                                    variant="label"
                                    className="mb-0 text-xs font-extrabold text-muted-foreground"
                                  >
                                    Оценка
                                  </FieldLegend>
                                  <RadioGroup
                                    aria-labelledby={`review-criterion-${criterion.id}-score-legend`}
                                    name={`criterion.${criterion.id}.score`}
                                    defaultValue={String(draftScore?.value ?? 3)}
                                    className="grid w-full grid-flow-row gap-0 overflow-clip rounded-md border border-border bg-card"
                                  >
                                    <label className={segmentLabelScaleClass}>
                                      <RadioGroupItem value="3" className={segmentRadioClass} />
                                      <span className="min-w-0 text-xs font-semibold leading-tight [overflow-wrap:anywhere]">
                                        3 · стандарт
                                      </span>
                                      <span data-segment-points className="shrink-0 text-[10px] font-bold tabular-nums leading-none text-muted-foreground">
                                        {criterion.weight}%
                                      </span>
                                    </label>
                                    <label className={segmentLabelScaleClass}>
                                      <RadioGroupItem value="2" className={segmentRadioClass} />
                                      <span className="min-w-0 text-xs font-semibold leading-tight [overflow-wrap:anywhere]">
                                        2 · доработка
                                      </span>
                                      <span data-segment-points className="shrink-0 text-[10px] font-bold tabular-nums leading-none text-muted-foreground">
                                        {(criterion.weight * 2 / 3).toFixed(criterion.weight % 3 === 0 ? 0 : 1)}%
                                      </span>
                                    </label>
                                    <label className={segmentLabelScaleClass}>
                                      <RadioGroupItem value="1" className={segmentRadioClass} />
                                      <span className="min-w-0 text-xs font-semibold leading-tight [overflow-wrap:anywhere]">
                                        1 · не соответствует
                                      </span>
                                      <span data-segment-points className="shrink-0 text-[10px] font-bold tabular-nums leading-none text-muted-foreground">
                                        {(criterion.weight / 3).toFixed(criterion.weight % 3 === 0 ? 0 : 1)}%
                                      </span>
                                    </label>
                                  </RadioGroup>
                                </FieldSet>
                              ) : (
                                <FieldSet className="min-w-0 gap-1.5">
                                  <FieldLegend
                                    id={`review-criterion-${criterion.id}-result-legend`}
                                    variant="label"
                                    className="mb-0 text-xs font-extrabold text-muted-foreground"
                                  >
                                    Результат
                                  </FieldLegend>
                                  <RadioGroup
                                    aria-labelledby={`review-criterion-${criterion.id}-result-legend`}
                                    name={`criterion.${criterion.id}.passed`}
                                    defaultValue={passedValue ? "true" : "false"}
                                    className="grid w-full grid-cols-1 gap-0 overflow-clip rounded-md border border-border bg-card sm:grid-cols-2"
                                  >
                                    <label className={segmentLabelBinaryClass}>
                                      <RadioGroupItem value="true" className={segmentRadioClass} />
                                      <span className="min-w-0 text-xs font-semibold leading-tight">Зачет</span>
                                      <span data-segment-points className="shrink-0 text-[10px] font-bold tabular-nums leading-none text-muted-foreground">
                                        +{criterion.weight}%
                                      </span>
                                    </label>
                                    <label className={segmentLabelDangerClass}>
                                      <RadioGroupItem value="false" className={segmentRadioClass} />
                                      <span className="min-w-0 text-xs font-semibold leading-tight">Незачет</span>
                                      <span data-segment-points className="shrink-0 text-[10px] font-bold tabular-nums leading-none text-muted-foreground">
                                        0%
                                      </span>
                                    </label>
                                  </RadioGroup>
                                </FieldSet>
                              )}

                              <label className="flex min-h-9 min-w-0 cursor-pointer items-center gap-2 self-stretch whitespace-normal rounded-md border border-dashed border-border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-muted focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring/50 sm:self-end sm:whitespace-nowrap">
                                <Checkbox
                                  name={`criterion.${criterion.id}.notApplicable`}
                                  defaultChecked={draftScore?.isNotApplicable ?? false}
                                />
                                Не применимо
                              </label>
                            </div>

                            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(150px,0.9fr)_minmax(190px,1.1fr)]">
                              <Field className="rounded-md border border-border bg-card/80 p-2.5">
                                <FieldLabel htmlFor={`review-criterion-${criterion.id}-evidence-message`}>
                                  Сообщение-доказательство
                                </FieldLabel>
                                <NativeSelect
                                  id={`review-criterion-${criterion.id}-evidence-message`}
                                  name={`criterion.${criterion.id}.evidenceMessageId`}
                                  defaultValue={draftScore?.evidenceMessageId ?? ""}
                                  className="w-full"
                                >
                                  <NativeSelectOption value="">Без привязки к сообщению</NativeSelectOption>
                                  {messages.map((message) => (
                                    <NativeSelectOption key={message.id} value={message.id}>
                                      {message.authorName}: {message.body.slice(0, 70)}
                                    </NativeSelectOption>
                                  ))}
                                </NativeSelect>
                                <FieldDescription>Реплика, на которую опирается оценка</FieldDescription>
                              </Field>

                              <Field className="rounded-md border border-border bg-card/80 p-2.5">
                                <FieldLabel htmlFor={`review-criterion-${criterion.id}-comment`}>
                                  Комментарий
                                </FieldLabel>
                                <Textarea
                                  id={`review-criterion-${criterion.id}-comment`}
                                  name={`criterion.${criterion.id}.comment`}
                                  rows={2}
                                  defaultValue={draftScore?.comment ?? ""}
                                  className="min-h-[72px] resize-y text-sm"
                                />
                                <FieldDescription>Коротко: факт, риск, ожидаемая формулировка</FieldDescription>
                              </Field>
                            </div>

                            {hasIssue ? (
                              <a
                                href="#coaching-analysis"
                                className="justify-self-start text-xs font-semibold text-primary underline-offset-4 hover:underline"
                              >
                                Добавить в разбор с оператором
                              </a>
                            ) : null}
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </StepDisclosure>

        <StepDisclosure
          number={2}
          title="Итог проверки"
          detail="Короткий вывод и классификация, без лишней детализации."
        >
          <div className="grid gap-4">
            <SummaryTemplatePicker templates={summaryTemplates} defaultValue={draftReview?.summary ?? ""} />

            <div className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="review-category">Категория</FieldLabel>
                <Input
                  id="review-category"
                  name="category"
                  list="category-templates"
                  required
                  defaultValue={draftFinding?.category ?? ""}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="review-owner-type">Ответственность</FieldLabel>
                <NativeSelect
                  id="review-owner-type"
                  name="ownerType"
                  required
                  defaultValue={draftFinding?.ownerType ?? "AGENT"}
                  className="w-full"
                >
                  <NativeSelectOption value="AGENT">{ownerTypeLabels.AGENT}</NativeSelectOption>
                  <NativeSelectOption value="PROCESS">{ownerTypeLabels.PROCESS}</NativeSelectOption>
                  <NativeSelectOption value="PRODUCT">{ownerTypeLabels.PRODUCT}</NativeSelectOption>
                  <NativeSelectOption value="POLICY">{ownerTypeLabels.POLICY}</NativeSelectOption>
                  <NativeSelectOption value="AI_SYSTEM">{ownerTypeLabels.AI_SYSTEM}</NativeSelectOption>
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel htmlFor="review-risk-level">Риск</FieldLabel>
                <NativeSelect
                  id="review-risk-level"
                  name="riskLevel"
                  required
                  defaultValue={draftFinding?.riskLevel ?? "LOW"}
                  className="w-full"
                >
                  <NativeSelectOption value="LOW">{riskLevelLabels.LOW}</NativeSelectOption>
                  <NativeSelectOption value="MEDIUM">{riskLevelLabels.MEDIUM}</NativeSelectOption>
                  <NativeSelectOption value="HIGH">{riskLevelLabels.HIGH}</NativeSelectOption>
                  <NativeSelectOption value="CRITICAL">{riskLevelLabels.CRITICAL}</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>

            <datalist id="category-templates">
              {categoryTemplates.map((template) => (
                <option key={template} value={template} />
              ))}
            </datalist>
          </div>
        </StepDisclosure>

        <StepDisclosure
          number={3}
          title="Дополнительно"
          detail="Критические ошибки, переответ, обратная связь и разбор."
          defaultOpen={hasOptionalDetails}
        >
          <div className="grid gap-3">
            <NestedDisclosure
              title="Критическая ошибка и переответ"
              detail="Открывайте только для обнуления оценки или переответа клиенту."
              defaultOpen={hasCriticalDetails}
            >
              <label className="flex min-h-7 cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
                <Checkbox name="criticalError" defaultChecked={draftReview?.criticalError ?? false} />
                Критическая ошибка: обнулить итоговую оценку
              </label>
              <Field>
                <FieldLabel htmlFor="review-critical-category">Тип критической ошибки</FieldLabel>
                <Input
                  id="review-critical-category"
                  name="criticalCategory"
                  list="critical-error-templates"
                  defaultValue={draftReview?.criticalCategory ?? ""}
                />
              </Field>
              <datalist id="critical-error-templates">
                {criticalErrorTemplates.map((template) => (
                  <option key={template} value={template} />
                ))}
              </datalist>
              <label className="flex min-h-7 cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
                <Checkbox name="needsReanswer" defaultChecked={draftReview?.needsReanswer ?? false} />
                Нужен переответ клиенту
              </label>
            </NestedDisclosure>

            <NestedDisclosure
              title="Обратная связь"
              detail="Комментарий оператору, сильные стороны и ссылки на материалы."
              defaultOpen={hasFeedbackDetails}
            >
              <Field>
                <FieldLabel htmlFor="review-feedback-comment">Комментарий для обратной связи</FieldLabel>
                <Textarea
                  id="review-feedback-comment"
                  name="feedbackComment"
                  rows={4}
                  defaultValue={draftReview?.feedbackComment ?? ""}
                  placeholder="Ошибки, критерии, ссылки на инструкции, корректный вариант решения."
                  className="min-h-[88px] resize-y text-sm"
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="review-positive-notes">Положительные моменты</FieldLabel>
                  <Textarea
                    id="review-positive-notes"
                    name="positiveNotes"
                    rows={2}
                    defaultValue={draftReview?.positiveNotes ?? ""}
                    className="min-h-[72px] resize-y text-sm"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="review-instruction-links">
                    Ссылки на инструкции и материалы
                  </FieldLabel>
                  <Textarea
                    id="review-instruction-links"
                    name="instructionLinks"
                    rows={2}
                    defaultValue={draftReview?.instructionLinks ?? ""}
                    className="min-h-[72px] resize-y text-sm"
                  />
                </Field>
              </div>
            </NestedDisclosure>

            <NestedDisclosure
              id="coaching-analysis"
              title="Разбор и калибровка"
              detail="Причина ошибки, доказательство, действие для разбора и заметки."
              defaultOpen={hasAnalysisDetails}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="review-root-cause">Корневая причина</FieldLabel>
                  <Textarea
                    id="review-root-cause"
                    name="rootCause"
                    rows={3}
                    defaultValue={draftFinding?.rootCause ?? ""}
                    className="min-h-[88px] resize-y text-sm"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="review-evidence-summary">Краткое доказательство</FieldLabel>
                  <Textarea
                    id="review-evidence-summary"
                    name="evidenceSummary"
                    rows={3}
                    defaultValue={draftFinding?.evidenceSummary ?? ""}
                    className="min-h-[88px] resize-y text-sm"
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_1fr_160px]">
                <Field>
                  <FieldLabel htmlFor="review-coaching-action">Действие для разбора</FieldLabel>
                  <Input
                    id="review-coaching-action"
                    name="coachingAction"
                    list="coaching-templates"
                    defaultValue={draftFinding?.coachingAction?.action ?? ""}
                  />
                </Field>
                <datalist id="coaching-templates">
                  {coachingTemplates.map((template) => (
                    <option key={template} value={template} />
                  ))}
                </datalist>
                <Field>
                  <FieldLabel htmlFor="review-coaching-assignee">Ответственный за разбор</FieldLabel>
                  <Input
                    id="review-coaching-assignee"
                    name="coachingAssignee"
                    defaultValue={draftFinding?.coachingAction?.assignee ?? ""}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="review-coaching-due-at">Срок</FieldLabel>
                  <Input
                    id="review-coaching-due-at"
                    name="coachingDueAt"
                    type="date"
                    defaultValue={draftFinding?.coachingAction?.dueAt?.toISOString().slice(0, 10) ?? ""}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="review-calibration-notes">Заметки для калибровки</FieldLabel>
                <Textarea
                  id="review-calibration-notes"
                  name="calibrationNotes"
                  rows={2}
                  defaultValue={draftReview?.calibrationNotes ?? ""}
                  className="min-h-[72px] resize-y text-sm"
                />
              </Field>
            </NestedDisclosure>
          </div>
        </StepDisclosure>
      </div>

      <ReviewKeyboard />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted px-4 py-2">
        <KbdGroup className="text-muted-foreground" aria-hidden="true">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          <span className="text-xs">·</span>
          <Kbd>1</Kbd>
          <Kbd>2</Kbd>
          <Kbd>3</Kbd>
          <span className="text-xs">·</span>
          <Kbd>?</Kbd>
        </KbdGroup>
        <a href="#coaching-analysis" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Добавить в обучение
        </a>
      </div>
    </ReviewFormShell>
  );
}
