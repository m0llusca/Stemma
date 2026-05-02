import type {
  CoachingAction,
  CriterionScore,
  Finding,
  Message,
  Review,
  Scorecard,
  ScorecardCriterion
} from "@prisma/client";
import { ownerTypeLabels, riskLevelLabels } from "@/lib/labels";
import { finalizeReview, saveReviewDraft } from "@/lib/review-actions";

type ReviewPanelProps = {
  conversationId: string;
  messages: Message[];
  scorecard: Scorecard & { criteria: ScorecardCriterion[] };
  draftReview?: (Review & { scores: CriterionScore[]; findings: (Finding & { coachingAction: CoachingAction | null })[] }) | null;
};

const categoryTemplates = [
  "Политика возврата",
  "Точность ответа",
  "Эмпатия и тон",
  "Скорость эскалации",
  "Работа с AI-подсказкой"
];

const coachingTemplates = [
  "Разобрать пример на 1:1 и закрепить корректную формулировку.",
  "Обновить макрос и показать команде эталонный ответ.",
  "Провести короткую калибровку по политике возврата.",
  "Добавить чек перед отправкой ответа клиенту."
];

export function ReviewPanel({ conversationId, messages, scorecard, draftReview }: ReviewPanelProps) {
  const draftScores = new Map(draftReview?.scores.map((score) => [score.criterionId, score]) ?? []);
  const draftFinding = draftReview?.findings[0];

  return (
    <form action={saveReviewDraft} className="panel p-5">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="scorecardId" value={scorecard.id} />

      <div className="mb-5">
        <h2 className="text-lg font-semibold">Панель проверки</h2>
        <p className="mt-1 text-sm text-[#667085]">
          {scorecard.name} v{scorecard.version}
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase text-[#667085]">Оценка по критериям</h3>
        {scorecard.criteria.map((criterion) => {
          const draftScore = draftScores.get(criterion.id);
          const passedValue = draftScore?.passed ?? true;

          return (
            <fieldset key={criterion.id} className="rounded-lg border border-[#d7dce5] p-4">
              <legend className="px-1 text-sm font-semibold text-[#17202a]">
                {criterion.order}. {criterion.label}
              </legend>
              <div className="mt-3 grid gap-3">
                {criterion.kind === "SCALE_1_3" ? (
                  <label className="grid gap-1 text-sm font-medium text-[#344054]">
                    Оценка
                    <select
                      name={`criterion.${criterion.id}.score`}
                      defaultValue={String(draftScore?.value ?? 3)}
                      className="rounded border border-[#d7dce5] bg-white px-3 py-2"
                    >
                      <option value="3">3 - соответствует стандарту</option>
                      <option value="2">2 - нужна доработка</option>
                      <option value="1">1 - не соответствует стандарту</option>
                    </select>
                  </label>
                ) : (
                  <div className="grid gap-2 text-sm font-medium text-[#344054]">
                    Результат
                    <label className="flex items-center gap-2 font-normal">
                      <input
                        type="radio"
                        name={`criterion.${criterion.id}.passed`}
                        value="true"
                        defaultChecked={passedValue}
                      />
                      Зачет
                    </label>
                    <label className="flex items-center gap-2 font-normal">
                      <input
                        type="radio"
                        name={`criterion.${criterion.id}.passed`}
                        value="false"
                        defaultChecked={!passedValue}
                      />
                      Незачет
                    </label>
                  </div>
                )}

                <label className="flex items-center gap-2 text-sm text-[#344054]">
                  <input
                    type="checkbox"
                    name={`criterion.${criterion.id}.notApplicable`}
                    defaultChecked={draftScore?.isNotApplicable ?? false}
                  />
                  Не применимо
                </label>

                <label className="grid gap-1 text-sm font-medium text-[#344054]">
                  Сообщение-доказательство
                  <select
                    name={`criterion.${criterion.id}.evidenceMessageId`}
                    defaultValue={draftScore?.evidenceMessageId ?? ""}
                    className="rounded border border-[#d7dce5] bg-white px-3 py-2"
                  >
                    <option value="">Без привязки к сообщению</option>
                    {messages.map((message) => (
                      <option key={message.id} value={message.id}>
                        {message.authorName}: {message.body.slice(0, 70)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-[#344054]">
                  Комментарий по критерию
                  <textarea
                    name={`criterion.${criterion.id}.comment`}
                    rows={2}
                    defaultValue={draftScore?.comment ?? ""}
                    className="resize-y rounded border border-[#d7dce5] bg-white px-3 py-2"
                  />
                </label>
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4">
        <h3 className="text-sm font-semibold uppercase text-[#667085]">Находка и причина</h3>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Итог проверки
          <textarea
            name="summary"
            rows={3}
            required
            defaultValue={draftReview?.summary ?? ""}
            className="resize-y rounded border border-[#d7dce5] px-3 py-2"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Ответственность
            <select
              name="ownerType"
              required
              defaultValue={draftFinding?.ownerType ?? "AGENT"}
              className="rounded border border-[#d7dce5] bg-white px-3 py-2"
            >
              <option value="AGENT">{ownerTypeLabels.AGENT}</option>
              <option value="PROCESS">{ownerTypeLabels.PROCESS}</option>
              <option value="PRODUCT">{ownerTypeLabels.PRODUCT}</option>
              <option value="POLICY">{ownerTypeLabels.POLICY}</option>
              <option value="AI_SYSTEM">{ownerTypeLabels.AI_SYSTEM}</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Риск
            <select
              name="riskLevel"
              required
              defaultValue={draftFinding?.riskLevel ?? "LOW"}
              className="rounded border border-[#d7dce5] bg-white px-3 py-2"
            >
              <option value="LOW">{riskLevelLabels.LOW}</option>
              <option value="MEDIUM">{riskLevelLabels.MEDIUM}</option>
              <option value="HIGH">{riskLevelLabels.HIGH}</option>
              <option value="CRITICAL">{riskLevelLabels.CRITICAL}</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Категория
            <input
              name="category"
              list="category-templates"
              required
              defaultValue={draftFinding?.category ?? ""}
              className="rounded border border-[#d7dce5] px-3 py-2"
            />
          </label>
        </div>
        <datalist id="category-templates">
          {categoryTemplates.map((template) => (
            <option key={template} value={template} />
          ))}
        </datalist>

        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Корневая причина
          <textarea
            name="rootCause"
            rows={3}
            required
            placeholder="Например: оператор не сверил ответ с актуальной политикой перед финальным сообщением."
            defaultValue={draftFinding?.rootCause ?? ""}
            className="resize-y rounded border border-[#d7dce5] px-3 py-2"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Краткое доказательство
          <textarea
            name="evidenceSummary"
            rows={3}
            required
            placeholder="Например: в сообщении-доказательстве клиенту обещан срок, которого нет в политике."
            defaultValue={draftFinding?.evidenceSummary ?? ""}
            className="resize-y rounded border border-[#d7dce5] px-3 py-2"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-[1fr_1fr_160px]">
          <h3 className="text-sm font-semibold uppercase text-[#667085] md:col-span-3">Коучинг</h3>
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Действие по коучингу
            <input
              name="coachingAction"
              list="coaching-templates"
              defaultValue={draftFinding?.coachingAction?.action ?? ""}
              className="rounded border border-[#d7dce5] px-3 py-2"
            />
          </label>
          <datalist id="coaching-templates">
            {coachingTemplates.map((template) => (
              <option key={template} value={template} />
            ))}
          </datalist>
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Ответственный за коучинг
            <input
              name="coachingAssignee"
              defaultValue={draftFinding?.coachingAction?.assignee ?? ""}
              className="rounded border border-[#d7dce5] px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Срок
            <input
              name="coachingDueAt"
              type="date"
              defaultValue={draftFinding?.coachingAction?.dueAt?.toISOString().slice(0, 10) ?? ""}
              className="rounded border border-[#d7dce5] px-3 py-2"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            formNoValidate
            className="rounded border border-[#116466] px-4 py-3 text-sm font-semibold text-[#0b4f52] hover:bg-[#eef4f4]"
          >
            Сохранить черновик
          </button>
          <button
            type="submit"
            formAction={finalizeReview}
            className="rounded bg-[#116466] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0b4f52]"
          >
            Завершить проверку
          </button>
        </div>
      </div>
    </form>
  );
}
