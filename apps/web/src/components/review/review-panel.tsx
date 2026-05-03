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
import { CopyButton } from "@/components/copy-button";
import { EvidencePickerListener } from "@/components/review/evidence-picker-listener";
import { ScoreBar } from "@/components/ui/score-bar";
import { StatusChip } from "@/components/ui/status-chip";
import { appealStatusLabels, feedbackStatusLabels, ownerTypeLabels, reanswerStatusLabels, riskLevelLabels } from "@/lib/labels";
import { finalizeReview, saveReviewDraft } from "@/lib/review-actions";

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

const summaryTemplates = [
  "Ответ соответствует стандарту: решение дано полно, тон корректный, следующий шаг понятен клиенту.",
  "Есть замечание: оператору нужно точнее опираться на регламент и явно фиксировать следующий шаг.",
  "Критическая ошибка: требуется разбор с руководителем и контроль переответа клиенту."
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

const feedbackStatuses = ["new", "feedback_sent", "acknowledged", "appeal", "corrected"] as const;
const appealStatuses = ["none", "open", "confirmed", "corrected", "calibration"] as const;
const reanswerStatuses = ["not_needed", "required", "requested", "completed"] as const;
const fieldClassName = "form-control text-sm";
const textareaClassName = `${fieldClassName} min-h-[88px] resize-y`;

function criterionStateLabel(criterion: ScorecardCriterion, score?: CriterionScore) {
  if (score?.isNotApplicable) {
    return "Не применимо";
  }

  if (criterion.kind === "SCALE_1_3") {
    return `Оценка ${score?.value ?? 3}/3`;
  }

  return score?.passed === false ? "Незачет" : "Зачет";
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
    <div className="step-header">
      <span className="step-header__number">
        {number}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold uppercase text-[#64748b]">{title}</h3>
        <p className="mt-1 text-sm text-[#475569]">{detail}</p>
      </div>
    </div>
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
    <form action={saveReviewDraft} className="review-panel-form panel overflow-hidden">
      <EvidencePickerListener />
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="scorecardId" value={scorecard.id} />
      <input type="hidden" name="reviewSource" value={reviewSource} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <div className="border-b border-[#d9e0ea] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-[#64748b]">
              {scorecard.name} v{scorecard.version}
            </p>
          </div>
          <span className="rounded-md bg-[#edf2ff] px-2 py-1 text-xs font-semibold text-[#1d3fae]">
            {scorecard.criteria.length} критериев
          </span>
        </div>
      </div>

      <section className="review-score-surface">
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

      <div className="review-panel-scroll">
      <section className="work-section work-section--muted">
        <StepHeader number={1} title="Оценка по критериям" detail="Заполните только то, что отличается от нормы." />

        <div className="space-y-3">
          {criteriaByBlock.map((group) => (
            <div key={group.block} className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase text-[#64748b]">{group.block}</h4>
                <span className="text-xs text-[#64748b]">{group.criteria.reduce((sum, criterion) => sum + criterion.weight, 0)}%</span>
              </div>
              {group.criteria.map((criterion) => {
                const draftScore = draftScores.get(criterion.id);
                const passedValue = draftScore?.passed ?? true;

                return (
                  <details
                    key={criterion.id}
                    className="criterion-card disclosure-panel"
                    open={shouldOpenCriterion(criterion, draftScore)}
                  >
                    <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold leading-5 text-[#111827]">
                          {criterion.order}. {criterion.label}
                        </h4>
                        <p className="mt-1 text-xs text-[#64748b]">
                          Вес {criterion.weight}% · {criterionStateLabel(criterion, draftScore)}
                        </p>
                      </div>
                      <span
                        className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#1d3fae]"
                        aria-hidden="true"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </span>
                    </summary>

                    <div className="grid gap-3 border-t border-[#d9e0ea] p-4">
                      {criterion.kind === "SCALE_1_3" ? (
                        <label className="grid gap-1 text-sm font-medium text-[#334155]">
                          Оценка
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
                        <fieldset className="grid gap-2 text-sm font-medium text-[#334155]">
                          <legend>Результат</legend>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex items-center gap-2 rounded-md border border-[#d9e0ea] bg-white px-3 py-2 font-normal">
                              <input
                                type="radio"
                                name={`criterion.${criterion.id}.passed`}
                                value="true"
                                defaultChecked={passedValue}
                              />
                              Зачет
                            </label>
                            <label className="flex items-center gap-2 rounded-md border border-[#d9e0ea] bg-white px-3 py-2 font-normal">
                              <input
                                type="radio"
                                name={`criterion.${criterion.id}.passed`}
                                value="false"
                                defaultChecked={!passedValue}
                              />
                              Незачет
                            </label>
                          </div>
                        </fieldset>
                      )}

                      <label className="flex min-h-7 items-center gap-2 text-sm text-[#334155]">
                        <input
                          type="checkbox"
                          name={`criterion.${criterion.id}.notApplicable`}
                          defaultChecked={draftScore?.isNotApplicable ?? false}
                        />
                        Не применимо
                      </label>

                      <label className="grid gap-1 text-sm font-medium text-[#334155]">
                        Сообщение-доказательство
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
                      </label>

                      <label className="grid gap-1 text-sm font-medium text-[#334155]">
                        Комментарий
                        <textarea
                          name={`criterion.${criterion.id}.comment`}
                          rows={2}
                          defaultValue={draftScore?.comment ?? ""}
                          className={textareaClassName}
                        />
                      </label>
                    </div>
                  </details>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="work-section">
        <StepHeader number={2} title="Итог проверки" detail="Короткий вывод и классификация, без лишней детализации." />

        <div className="grid gap-4">
          <details className="compact-details">
            <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm font-semibold text-[#111827]">Шаблоны итогового комментария</span>
              <span className="text-xs font-semibold uppercase text-[#64748b]">3 варианта</span>
            </summary>
            <div className="grid gap-2 border-t border-[#d9e0ea] p-3">
              {summaryTemplates.map((template) => (
                <div key={template} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-3 py-2">
                  <span className="text-sm leading-5 text-[#334155]">{template}</span>
                  <CopyButton value={template} label="Скопировать" />
                </div>
              ))}
            </div>
          </details>

          <label className="grid gap-1 text-sm font-medium text-[#334155]">
            Итог проверки
            <textarea
              name="summary"
              rows={3}
              required
              defaultValue={draftReview?.summary ?? ""}
              className={textareaClassName}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Категория
              <input
                name="category"
                list="category-templates"
                required
                defaultValue={draftFinding?.category ?? ""}
                className={fieldClassName}
              />
            </label>

            <label className="grid gap-1 text-sm font-medium text-[#334155]">
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

            <label className="grid gap-1 text-sm font-medium text-[#334155]">
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
      </section>

      <details className="disclosure-panel border-b border-[#d9e0ea]" open={hasOptionalDetails}>
        <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold uppercase text-[#64748b]">Дополнительно</h3>
            <p className="mt-1 text-sm text-[#64748b]">Критические ошибки, переответ, обратная связь и разбор</p>
          </div>
          <span
            className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#1d3fae]"
            aria-hidden="true"
          >
            <ChevronDown className="h-4 w-4" />
          </span>
        </summary>

        <div className="grid gap-3 border-t border-[#d9e0ea] p-5">
          <details className="disclosure-panel overflow-hidden rounded-md border border-[#d9e0ea]" open={hasCriticalDetails}>
            <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-[#111827]">Критическая ошибка и переответ</h4>
                <p className="mt-1 text-xs text-[#64748b]">Открывайте только для обнуления оценки или переответа клиенту.</p>
              </div>
              <span className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#1d3fae]" aria-hidden="true">
                <ChevronDown className="h-4 w-4" />
              </span>
            </summary>

            <div className="grid gap-4 border-t border-[#d9e0ea] bg-[#f8fafc] p-4">
              <label className="flex min-h-7 items-center gap-2 text-sm font-semibold text-[#334155]">
                <input name="criticalError" type="checkbox" defaultChecked={draftReview?.criticalError ?? false} />
                Критическая ошибка: обнулить итоговую оценку
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
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
              <label className="flex min-h-7 items-center gap-2 text-sm font-semibold text-[#334155]">
                <input name="needsReanswer" type="checkbox" defaultChecked={draftReview?.needsReanswer ?? false} />
                Нужен переответ клиенту
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-1 text-sm font-medium text-[#334155]">
                  Статус обратной связи
                  <select name="feedbackStatus" defaultValue={draftReview?.feedbackStatus ?? "new"} className={fieldClassName}>
                    {feedbackStatuses.map((status) => (
                      <option key={status} value={status}>
                        {feedbackStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-[#334155]">
                  Апелляция
                  <select name="appealStatus" defaultValue={draftReview?.appealStatus ?? "none"} className={fieldClassName}>
                    {appealStatuses.map((status) => (
                      <option key={status} value={status}>
                        {appealStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-[#334155]">
                  Переответ
                  <select name="reanswerStatus" defaultValue={draftReview?.reanswerStatus ?? "not_needed"} className={fieldClassName}>
                    {reanswerStatuses.map((status) => (
                      <option key={status} value={status}>
                        {reanswerStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </details>

          <details className="disclosure-panel overflow-hidden rounded-md border border-[#d9e0ea]" open={hasFeedbackDetails}>
            <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-[#111827]">Обратная связь</h4>
                <p className="mt-1 text-xs text-[#64748b]">Комментарий оператору, сильные стороны и ссылки на материалы.</p>
              </div>
              <span className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#1d3fae]" aria-hidden="true">
                <ChevronDown className="h-4 w-4" />
              </span>
            </summary>

            <div className="grid gap-4 border-t border-[#d9e0ea] bg-[#f8fafc] p-4">
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
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
                <label className="grid gap-1 text-sm font-medium text-[#334155]">
                  Положительные моменты
                  <textarea
                    name="positiveNotes"
                    rows={2}
                    defaultValue={draftReview?.positiveNotes ?? ""}
                    className={textareaClassName}
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-[#334155]">
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

          <details className="disclosure-panel overflow-hidden rounded-md border border-[#d9e0ea]" open={hasAnalysisDetails}>
            <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-[#111827]">Разбор и калибровка</h4>
                <p className="mt-1 text-xs text-[#64748b]">Причина ошибки, доказательство, действие для разбора и заметки.</p>
              </div>
              <span className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#1d3fae]" aria-hidden="true">
                <ChevronDown className="h-4 w-4" />
              </span>
            </summary>

            <div className="grid gap-4 border-t border-[#d9e0ea] bg-[#f8fafc] p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-[#334155]">
                  Корневая причина
                  <textarea
                    name="rootCause"
                    rows={3}
                    defaultValue={draftFinding?.rootCause ?? ""}
                    className={textareaClassName}
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-[#334155]">
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
                <label className="grid gap-1 text-sm font-medium text-[#334155]">
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
                <label className="grid gap-1 text-sm font-medium text-[#334155]">
                  Ответственный за разбор
                  <input
                    name="coachingAssignee"
                    defaultValue={draftFinding?.coachingAction?.assignee ?? ""}
                    className={fieldClassName}
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-[#334155]">
                  Срок
                  <input
                    name="coachingDueAt"
                    type="date"
                    defaultValue={draftFinding?.coachingAction?.dueAt?.toISOString().slice(0, 10) ?? ""}
                    className={fieldClassName}
                  />
                </label>
              </div>

              <label className="grid gap-1 text-sm font-medium text-[#334155]">
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
      </details>
      </div>

      <div className="review-actions-bar">
        <button
          type="submit"
          formNoValidate
          className="action-button"
        >
          Сохранить черновик
        </button>
        <button
          type="submit"
          formAction={finalizeReview}
          className="action-button action-button--primary"
        >
          Завершить проверку
        </button>
      </div>
    </form>
  );
}
