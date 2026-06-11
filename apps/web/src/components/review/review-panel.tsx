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
import { EvidencePickerListener } from "@/components/review/evidence-picker-listener";
import { ReviewFormShell } from "@/components/review/review-form-shell";
import { SummaryTemplatePicker, type SummaryTemplate } from "@/components/review/summary-template-picker";
import { ScoreBar } from "@/components/ui/score-bar";
import { StatusChip } from "@/components/ui/status-chip";
import { ownerTypeLabels, riskLevelLabels } from "@/lib/labels";
import styles from "./review-panel-workbench.module.css";

type ReviewPanelProps = {
  conversationId: string;
  messages: Message[];
  scorecard: Scorecard & { criteria: ScorecardCriterion[] };
  draftReview?: (Review & { scores: CriterionScore[]; findings: (Finding & { coachingAction: CoachingAction | null })[] }) | null;
  reviewSource?: ReviewSource;
  returnTo?: string;
  title?: string;
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

const fieldClassName = "form-control text-sm";
const textareaClassName = `${fieldClassName} min-h-[88px] resize-y`;
type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const workbenchStatusToneClass: Record<StatusTone, string> = {
  neutral: styles.statusNeutral,
  success: styles.statusSuccess,
  warning: styles.statusWarning,
  danger: styles.statusDanger,
  info: styles.statusInfo,
  accent: styles.statusAccent
};

function isCriterionIssue(criterion: ScorecardCriterion, score?: CriterionScore) {
  if (score?.isNotApplicable) {
    return false;
  }

  if (criterion.kind === "SCALE_1_3") {
    return (score?.value ?? 3) < 3;
  }

  return score?.passed === false;
}

function criterionStatus(criterion: ScorecardCriterion, score?: CriterionScore): { label: string; tone: StatusTone } {
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

  if (score?.evidenceMessageId) {
    meta.push("доказательство");
  }

  if (score?.comment) {
    meta.push("комментарий");
  }

  return meta;
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
    <div className={`step-header ${styles.stepHeader}`}>
      <span className={`step-header__number ${styles.stepNumber}`}>
        {number}
      </span>
      <div className="min-w-0">
        <h3 className={styles.stepTitle}>{title}</h3>
        <p className={styles.stepDetail}>{detail}</p>
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
    <details
      className={`work-section ${styles.stepDisclosure} ${className ?? ""}`}
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className={styles.stepSummary}>
        <StepHeader number={number} title={title} detail={detail} />
        <span className={styles.stepDisclosureChevron} aria-hidden="true">
          <ChevronDown className="h-4 w-4" />
        </span>
      </summary>
      <div className={styles.stepBody}>{children}</div>
    </details>
  );
}

function WorkbenchStatus({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span className={`${styles.statusBadge} ${workbenchStatusToneClass[tone]}`}>
      <span>{children}</span>
    </span>
  );
}

export function ReviewPanel({
  conversationId,
  messages,
  scorecard,
  draftReview,
  reviewSource = "HUMAN",
  returnTo,
  title = "Проверка"
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

  return (
    <ReviewFormShell className={`review-panel-form panel overflow-hidden ${styles.workbench}`}>
      <EvidencePickerListener />
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="scorecardId" value={scorecard.id} />
      <input type="hidden" name="reviewSource" value={reviewSource} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <div className={styles.panelHeader}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={styles.panelTitle}>{title}</h2>
            <p className={styles.panelSubtitle}>
              {scorecard.name} v{scorecard.version}
            </p>
          </div>
          <span className={styles.criteriaCount}>
            {scorecard.criteria.length} критериев
          </span>
        </div>
      </div>

      <section className={`review-score-surface ${styles.scoreSurface}`}>
        <div className="grid gap-3">
          <div className="min-w-0">
            <ScoreBar value={draftReview?.totalScore} emptyLabel="Еще не сохранен" />
          </div>
          <div className="signal-row">
            <StatusChip tone={draftReview?.criticalError ? "danger" : "neutral"} size="xs">
              {draftReview?.criticalError ? "Критическая" : "Без критической"}
            </StatusChip>
            <StatusChip tone={draftReview?.needsReanswer ? "warning" : "neutral"} size="xs">
              {draftReview?.needsReanswer ? "Нужен переответ" : "Переответ не нужен"}
            </StatusChip>
            <StatusChip tone={draftFinding?.category ? "accent" : "neutral"} size="xs">
              {draftFinding?.category ?? "Категория не выбрана"}
            </StatusChip>
          </div>
        </div>
      </section>

      <div className={`review-panel-scroll ${styles.panelScroll}`}>
        <StepDisclosure
          number={1}
          title="Оценка по критериям"
          detail="Заполните только то, что отличается от нормы."
          className={`work-section--muted ${styles.criteriaSection}`}
        >
          <div className={styles.processStack}>
            {criteriaByBlock.map((group) => {
              const groupWeight = group.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
              const issueCount = group.criteria.filter((criterion) => isCriterionIssue(criterion, draftScores.get(criterion.id))).length;
              const evidenceCount = group.criteria.filter((criterion) => draftScores.get(criterion.id)?.evidenceMessageId).length;
              const commentCount = group.criteria.filter((criterion) => draftScores.get(criterion.id)?.comment).length;
              const skippedCount = group.criteria.filter((criterion) => draftScores.get(criterion.id)?.isNotApplicable).length;

              return (
                <section key={group.block} className={styles.processGroup}>
                  <header className={styles.processGroupHeader}>
                    <div className={styles.processGroupTitleBlock}>
                      <span className={styles.groupEyebrow}>Группа процесса</span>
                      <h4 className={styles.processGroupTitle}>{group.block}</h4>
                    </div>
                    <div className={styles.groupSignals}>
                      <WorkbenchStatus tone={issueCount > 0 ? "warning" : "success"}>
                        {issueCount > 0 ? `${issueCount} замеч.` : "без замечаний"}
                      </WorkbenchStatus>
                      {evidenceCount > 0 ? (
                        <WorkbenchStatus tone="info">
                          {evidenceCount} доказ.
                        </WorkbenchStatus>
                      ) : null}
                      {commentCount > 0 ? (
                        <WorkbenchStatus tone="accent">
                          {commentCount} комм.
                        </WorkbenchStatus>
                      ) : null}
                      {skippedCount > 0 ? (
                        <WorkbenchStatus tone="neutral">
                          {skippedCount} Н/П
                        </WorkbenchStatus>
                      ) : null}
                      <span className={styles.groupWeight}>{groupWeight}%</span>
                    </div>
                  </header>

                  <div className={styles.criteriaList}>
                    {group.criteria.map((criterion) => {
                      const draftScore = draftScores.get(criterion.id);
                      const passedValue = draftScore?.passed ?? true;
                      const status = criterionStatus(criterion, draftScore);
                      const densityMeta = getCriterionDensityMeta(draftScore);
                      const hasIssue = isCriterionIssue(criterion, draftScore);

                      return (
                        <details
                          key={criterion.id}
                          className={`criterion-card disclosure-panel ${styles.criterionCard}`}
                          data-state={hasIssue ? "issue" : draftScore?.isNotApplicable ? "muted" : "ok"}
                          open={shouldOpenCriterion(criterion, draftScore)}
                        >
                          <summary className={`disclosure-summary ${styles.criterionSummary}`}>
                            <span className={styles.criterionOrder}>{criterion.order}</span>
                            <div className={styles.criterionMain}>
                              <div className={styles.criterionTopline}>
                                <h4 className={styles.criterionTitle}>{criterion.label}</h4>
                                <WorkbenchStatus tone={status.tone}>
                                  {status.label}
                                </WorkbenchStatus>
                              </div>
                              <div className={styles.criterionMeta}>
                                <span>Вес {criterion.weight}%</span>
                                <span>{criterion.kind === "SCALE_1_3" ? "Шкала 1-3" : "Да/нет"}</span>
                                {densityMeta.map((item) => (
                                  <span key={item}>{item}</span>
                                ))}
                              </div>
                            </div>
                            <span className={`disclosure-chevron ${styles.chevron}`} aria-hidden="true">
                              <ChevronDown className="h-4 w-4" />
                            </span>
                          </summary>

                          <div className={styles.criterionBody}>
                            <div className={styles.controlPanel}>
                              {criterion.kind === "SCALE_1_3" ? (
                                <label className={styles.fieldGroup}>
                                  <span className={styles.fieldLabel}>Оценка</span>
                                  <select
                                    name={`criterion.${criterion.id}.score`}
                                    defaultValue={String(draftScore?.value ?? 3)}
                                    className={fieldClassName}
                                  >
                                    <option value="3">3 - соответствует стандарту</option>
                                    <option value="2">2 - нужна доработка</option>
                                    <option value="1">1 - не соответствует стандарту</option>
                                  </select>
                                </label>
                              ) : (
                                <fieldset className={styles.resultFieldset}>
                                  <legend className={styles.fieldLabel}>Результат</legend>
                                  <div className={styles.choiceGrid}>
                                    <label className={styles.choiceCard}>
                                      <input
                                        type="radio"
                                        name={`criterion.${criterion.id}.passed`}
                                        value="true"
                                        defaultChecked={passedValue}
                                      />
                                      <span>Зачет</span>
                                    </label>
                                    <label className={`${styles.choiceCard} ${styles.choiceCardDanger}`}>
                                      <input
                                        type="radio"
                                        name={`criterion.${criterion.id}.passed`}
                                        value="false"
                                        defaultChecked={!passedValue}
                                      />
                                      <span>Незачет</span>
                                    </label>
                                  </div>
                                </fieldset>
                              )}

                              <label className={styles.notApplicableToggle}>
                                <input
                                  type="checkbox"
                                  name={`criterion.${criterion.id}.notApplicable`}
                                  defaultChecked={draftScore?.isNotApplicable ?? false}
                                />
                                Не применимо
                              </label>
                            </div>

                            <div className={styles.evidenceGrid}>
                              <label className={`${styles.fieldGroup} ${styles.evidenceField}`}>
                                <span className={styles.fieldLabel}>Сообщение-доказательство</span>
                                <select
                                  name={`criterion.${criterion.id}.evidenceMessageId`}
                                  defaultValue={draftScore?.evidenceMessageId ?? ""}
                                  className={fieldClassName}
                                >
                                  <option value="">Без привязки к сообщению</option>
                                  {messages.map((message) => (
                                    <option key={message.id} value={message.id}>
                                      {message.authorName}: {message.body.slice(0, 70)}
                                    </option>
                                  ))}
                                </select>
                                <span className={styles.fieldHint}>Реплика, на которую опирается оценка</span>
                              </label>

                              <label className={`${styles.fieldGroup} ${styles.commentField}`}>
                                <span className={styles.fieldLabel}>Комментарий</span>
                                <textarea
                                  name={`criterion.${criterion.id}.comment`}
                                  rows={2}
                                  defaultValue={draftScore?.comment ?? ""}
                                  className={textareaClassName}
                                />
                                <span className={styles.fieldHint}>Коротко: факт, риск, ожидаемая формулировка</span>
                              </label>
                            </div>
                          </div>
                        </details>
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
            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              Категория
              <input
                name="category"
                list="category-templates"
                required
                defaultValue={draftFinding?.category ?? ""}
                className={fieldClassName}
              />
            </label>

            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              Ответственность
              <select
                name="ownerType"
                required
                defaultValue={draftFinding?.ownerType ?? "AGENT"}
                className={fieldClassName}
              >
                <option value="AGENT">{ownerTypeLabels.AGENT}</option>
                <option value="PROCESS">{ownerTypeLabels.PROCESS}</option>
                <option value="PRODUCT">{ownerTypeLabels.PRODUCT}</option>
                <option value="POLICY">{ownerTypeLabels.POLICY}</option>
                <option value="AI_SYSTEM">{ownerTypeLabels.AI_SYSTEM}</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              Риск
              <select
                name="riskLevel"
                required
                defaultValue={draftFinding?.riskLevel ?? "LOW"}
                className={fieldClassName}
              >
                <option value="LOW">{riskLevelLabels.LOW}</option>
                <option value="MEDIUM">{riskLevelLabels.MEDIUM}</option>
                <option value="HIGH">{riskLevelLabels.HIGH}</option>
                <option value="CRITICAL">{riskLevelLabels.CRITICAL}</option>
              </select>
            </label>
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
          <details className="disclosure-panel overflow-hidden rounded-md border border-[var(--border)]" open={hasCriticalDetails}>
            <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-[var(--foreground)]">Критическая ошибка и переответ</h4>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Открывайте только для обнуления оценки или переответа клиенту.</p>
              </div>
              <span className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#1d3fae]" aria-hidden="true">
                <ChevronDown className="h-4 w-4" />
              </span>
            </summary>

            <div className="grid gap-4 border-t border-[var(--border)] bg-[#f8fafc] p-4">
              <label className="flex min-h-7 items-center gap-2 text-sm font-semibold text-[var(--text-body)]">
                <input name="criticalError" type="checkbox" defaultChecked={draftReview?.criticalError ?? false} />
                Критическая ошибка: обнулить итоговую оценку
              </label>
              <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                Тип критической ошибки
                <input
                  name="criticalCategory"
                  list="critical-error-templates"
                  defaultValue={draftReview?.criticalCategory ?? ""}
                  className={fieldClassName}
                />
              </label>
              <datalist id="critical-error-templates">
                {criticalErrorTemplates.map((template) => (
                  <option key={template} value={template} />
                ))}
              </datalist>
              <label className="flex min-h-7 items-center gap-2 text-sm font-semibold text-[var(--text-body)]">
                <input name="needsReanswer" type="checkbox" defaultChecked={draftReview?.needsReanswer ?? false} />
                Нужен переответ клиенту
              </label>

            </div>
          </details>

          <details className="disclosure-panel overflow-hidden rounded-md border border-[var(--border)]" open={hasFeedbackDetails}>
            <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-[var(--foreground)]">Обратная связь</h4>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Комментарий оператору, сильные стороны и ссылки на материалы.</p>
              </div>
              <span className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#1d3fae]" aria-hidden="true">
                <ChevronDown className="h-4 w-4" />
              </span>
            </summary>

            <div className="grid gap-4 border-t border-[var(--border)] bg-[#f8fafc] p-4">
              <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                Комментарий для обратной связи
                <textarea
                  name="feedbackComment"
                  rows={4}
                  defaultValue={draftReview?.feedbackComment ?? ""}
                  placeholder="Ошибки, критерии, ссылки на инструкции, корректный вариант решения."
                  className={textareaClassName}
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                  Положительные моменты
                  <textarea
                    name="positiveNotes"
                    rows={2}
                    defaultValue={draftReview?.positiveNotes ?? ""}
                    className={textareaClassName}
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                  Ссылки на инструкции и материалы
                  <textarea
                    name="instructionLinks"
                    rows={2}
                    defaultValue={draftReview?.instructionLinks ?? ""}
                    className={textareaClassName}
                  />
                </label>
              </div>
            </div>
          </details>

          <details className="disclosure-panel overflow-hidden rounded-md border border-[var(--border)]" open={hasAnalysisDetails}>
            <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-[var(--foreground)]">Разбор и калибровка</h4>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Причина ошибки, доказательство, действие для разбора и заметки.</p>
              </div>
              <span className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#1d3fae]" aria-hidden="true">
                <ChevronDown className="h-4 w-4" />
              </span>
            </summary>

            <div className="grid gap-4 border-t border-[var(--border)] bg-[#f8fafc] p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                  Корневая причина
                  <textarea
                    name="rootCause"
                    rows={3}
                    defaultValue={draftFinding?.rootCause ?? ""}
                    className={textareaClassName}
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                  Краткое доказательство
                  <textarea
                    name="evidenceSummary"
                    rows={3}
                    defaultValue={draftFinding?.evidenceSummary ?? ""}
                    className={textareaClassName}
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_1fr_160px]">
                <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                  Действие для разбора
                  <input
                    name="coachingAction"
                    list="coaching-templates"
                    defaultValue={draftFinding?.coachingAction?.action ?? ""}
                    className={fieldClassName}
                  />
                </label>
                <datalist id="coaching-templates">
                  {coachingTemplates.map((template) => (
                    <option key={template} value={template} />
                  ))}
                </datalist>
                <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                  Ответственный за разбор
                  <input
                    name="coachingAssignee"
                    defaultValue={draftFinding?.coachingAction?.assignee ?? ""}
                    className={fieldClassName}
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                  Срок
                  <input
                    name="coachingDueAt"
                    type="date"
                    defaultValue={draftFinding?.coachingAction?.dueAt?.toISOString().slice(0, 10) ?? ""}
                    className={fieldClassName}
                  />
                </label>
              </div>

              <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                Заметки для калибровки
                <textarea
                  name="calibrationNotes"
                  rows={2}
                  defaultValue={draftReview?.calibrationNotes ?? ""}
                  className={textareaClassName}
                />
              </label>
            </div>
          </details>
        </div>
      </StepDisclosure>
      </div>
    </ReviewFormShell>
  );
}
