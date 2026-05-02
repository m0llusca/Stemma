import type { Message, Scorecard, ScorecardCriterion } from "@prisma/client";
import { finalizeReview } from "@/lib/review-actions";

type ReviewPanelProps = {
  conversationId: string;
  messages: Message[];
  scorecard: Scorecard & { criteria: ScorecardCriterion[] };
};

export function ReviewPanel({ conversationId, messages, scorecard }: ReviewPanelProps) {
  return (
    <form action={finalizeReview} className="panel p-5">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="scorecardId" value={scorecard.id} />

      <div className="mb-5">
        <h2 className="text-lg font-semibold">Review panel</h2>
        <p className="mt-1 text-sm text-[#667085]">
          {scorecard.name} v{scorecard.version}
        </p>
      </div>

      <div className="space-y-4">
        {scorecard.criteria.map((criterion) => (
          <fieldset key={criterion.id} className="rounded-lg border border-[#d7dce5] p-4">
            <legend className="px-1 text-sm font-semibold text-[#17202a]">
              {criterion.order}. {criterion.label}
            </legend>
            <div className="mt-3 grid gap-3">
              {criterion.kind === "SCALE_1_3" ? (
                <label className="grid gap-1 text-sm font-medium text-[#344054]">
                  Score
                  <select
                    name={`criterion.${criterion.id}.score`}
                    defaultValue="3"
                    className="rounded border border-[#d7dce5] bg-white px-3 py-2"
                  >
                    <option value="3">3 - Meets standard</option>
                    <option value="2">2 - Needs improvement</option>
                    <option value="1">1 - Missed standard</option>
                  </select>
                </label>
              ) : (
                <div className="grid gap-2 text-sm font-medium text-[#344054]">
                  Result
                  <label className="flex items-center gap-2 font-normal">
                    <input type="radio" name={`criterion.${criterion.id}.passed`} value="true" defaultChecked />
                    Pass
                  </label>
                  <label className="flex items-center gap-2 font-normal">
                    <input type="radio" name={`criterion.${criterion.id}.passed`} value="false" />
                    Fail
                  </label>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-[#344054]">
                <input type="checkbox" name={`criterion.${criterion.id}.notApplicable`} />
                Not applicable
              </label>

              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Evidence message
                <select
                  name={`criterion.${criterion.id}.evidenceMessageId`}
                  defaultValue=""
                  className="rounded border border-[#d7dce5] bg-white px-3 py-2"
                >
                  <option value="">No specific message</option>
                  {messages.map((message) => (
                    <option key={message.id} value={message.id}>
                      {message.authorName}: {message.body.slice(0, 70)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Criterion note
                <textarea
                  name={`criterion.${criterion.id}.comment`}
                  rows={2}
                  className="resize-y rounded border border-[#d7dce5] bg-white px-3 py-2"
                />
              </label>
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mt-6 grid gap-4">
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Summary
          <textarea name="summary" rows={3} required className="resize-y rounded border border-[#d7dce5] px-3 py-2" />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Owner
            <select name="ownerType" required className="rounded border border-[#d7dce5] bg-white px-3 py-2">
              <option value="AGENT">Agent</option>
              <option value="PROCESS">Process</option>
              <option value="PRODUCT">Product</option>
              <option value="POLICY">Policy</option>
              <option value="AI_SYSTEM">AI system</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Risk
            <select name="riskLevel" required className="rounded border border-[#d7dce5] bg-white px-3 py-2">
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Category
            <input name="category" required className="rounded border border-[#d7dce5] px-3 py-2" />
          </label>
        </div>

        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Root cause
          <textarea name="rootCause" rows={3} required className="resize-y rounded border border-[#d7dce5] px-3 py-2" />
        </label>

        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Evidence
          <textarea
            name="evidenceSummary"
            rows={3}
            required
            className="resize-y rounded border border-[#d7dce5] px-3 py-2"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-[1fr_1fr_160px]">
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Coaching action
            <input name="coachingAction" className="rounded border border-[#d7dce5] px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Coaching assignee
            <input name="coachingAssignee" className="rounded border border-[#d7dce5] px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Due date
            <input name="coachingDueAt" type="date" className="rounded border border-[#d7dce5] px-3 py-2" />
          </label>
        </div>

        <button
          type="submit"
          className="rounded bg-[#116466] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0b4f52]"
        >
          Complete review
        </button>
      </div>
    </form>
  );
}
