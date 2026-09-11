import { describe, expect, it } from "vitest";
import {
  firstIncompleteCriterionControl,
  isReviewFormReadyToSubmit,
  isReviewScorecardComplete
} from "@/lib/review/scorecard-readiness";

function mountForm(html: string) {
  document.body.innerHTML = html;
  return document.querySelector("form") as HTMLFormElement;
}

describe("isReviewScorecardComplete", () => {
  it("is true when the form has no criterion cards", () => {
    const form = mountForm(`<form><input name="summary" required value="ok" /></form>`);
    expect(isReviewScorecardComplete(form)).toBe(true);
  });

  it("is false until every card has a score or N/A", () => {
    const form = mountForm(`
      <form>
        <div data-criterion-card="">
          <input type="radio" name="criterion.a.score" value="3" />
          <input type="checkbox" name="criterion.a.notApplicable" />
        </div>
        <div data-criterion-card="">
          <input type="radio" name="criterion.b.passed" value="true" />
          <input type="checkbox" name="criterion.b.notApplicable" />
        </div>
      </form>
    `);

    expect(isReviewScorecardComplete(form)).toBe(false);

    form.querySelector<HTMLInputElement>('input[name="criterion.a.score"]')!.checked = true;
    expect(isReviewScorecardComplete(form)).toBe(false);

    form.querySelector<HTMLInputElement>('input[name="criterion.b.notApplicable"]')!.checked = true;
    expect(isReviewScorecardComplete(form)).toBe(true);
  });
});

describe("isReviewFormReadyToSubmit", () => {
  it("requires both native validity and a complete scorecard", () => {
    const form = mountForm(`
      <form>
        <input name="summary" required value="" />
        <div data-criterion-card="">
          <input type="radio" name="criterion.a.score" value="3" />
        </div>
      </form>
    `);

    expect(isReviewFormReadyToSubmit(form)).toBe(false);

    form.querySelector<HTMLInputElement>('input[name="summary"]')!.value = "Итог";
    expect(isReviewFormReadyToSubmit(form)).toBe(false);

    form.querySelector<HTMLInputElement>('input[name="criterion.a.score"]')!.checked = true;
    expect(isReviewFormReadyToSubmit(form)).toBe(true);
  });
});

describe("firstIncompleteCriterionControl", () => {
  it("returns the first unscored radio", () => {
    const form = mountForm(`
      <form>
        <div data-criterion-card="">
          <input type="radio" name="criterion.a.score" value="3" checked />
        </div>
        <div data-criterion-card="">
          <input type="radio" name="criterion.b.score" value="2" />
        </div>
      </form>
    `);

    const control = firstIncompleteCriterionControl(form);
    expect(control).toBeInstanceOf(HTMLInputElement);
    expect((control as HTMLInputElement).name).toBe("criterion.b.score");
  });
});
