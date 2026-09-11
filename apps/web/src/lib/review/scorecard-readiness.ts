import { isFormReadyToSubmit, type FormSubmitGate } from "@/lib/form-validity";

/**
 * True when every criterion card is either marked N/A or has a score/pass radio
 * checked. Native checkValidity alone is not enough — criterion radios are not
 * `required`, so filling only the summary fields would otherwise unlock Finalize.
 */
export function isReviewScorecardComplete(form: HTMLFormElement) {
  const cards = form.querySelectorAll<HTMLElement>("[data-criterion-card]");

  if (cards.length === 0) {
    return true;
  }

  for (const card of Array.from(cards)) {
    const notApplicable = card.querySelector<HTMLInputElement>(
      'input[type="checkbox"][name$=".notApplicable"]'
    );

    if (notApplicable?.checked) {
      continue;
    }

    const scored = card.querySelector(
      'input[type="radio"][name$=".score"]:checked, input[type="radio"][name$=".passed"]:checked'
    );

    if (!scored) {
      return false;
    }
  }

  return true;
}

export function isReviewFormReadyToSubmit(form: HTMLFormElement, gate: FormSubmitGate = {}) {
  return isFormReadyToSubmit(form, gate) && isReviewScorecardComplete(form);
}

export function firstIncompleteCriterionControl(form: HTMLFormElement): HTMLElement | null {
  const cards = form.querySelectorAll<HTMLElement>("[data-criterion-card]");

  for (const card of Array.from(cards)) {
    const notApplicable = card.querySelector<HTMLInputElement>(
      'input[type="checkbox"][name$=".notApplicable"]'
    );

    if (notApplicable?.checked) {
      continue;
    }

    const scored = card.querySelector(
      'input[type="radio"][name$=".score"]:checked, input[type="radio"][name$=".passed"]:checked'
    );

    if (scored) {
      continue;
    }

    return (
      card.querySelector<HTMLElement>(
        'input[type="radio"][name$=".score"], input[type="radio"][name$=".passed"]'
      ) ?? null
    );
  }

  return null;
}
