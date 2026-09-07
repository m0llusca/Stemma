import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";

import {
  announceToLiveRegion,
  firstInvalidControl,
  focusFirstInvalidControl,
  isFormReadyToSubmit
} from "@/lib/form-validity";

function mountForm(html: string) {
  const form = document.createElement("form");
  form.innerHTML = html;
  document.body.append(form);
  return form;
}

describe("form validity helpers", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("treats a required empty field as not ready and returns it as first invalid", () => {
    const form = mountForm(`
      <input name="summary" required value="" />
      <input name="category" required value="Категория" />
    `);

    expect(isFormReadyToSubmit(form)).toBe(false);
    expect(firstInvalidControl(form)).toBe(form.elements.namedItem("summary"));
  });

  it("is ready only when every required field has a value", () => {
    const form = mountForm(`
      <input name="summary" required value="Итог" />
      <input name="category" required value="Категория" />
    `);

    expect(isFormReadyToSubmit(form)).toBe(true);
    expect(firstInvalidControl(form)).toBeNull();
  });

  it("focuses the first invalid control without enabling the form", () => {
    const form = mountForm(`<textarea name="summary" required></textarea>`);
    const summary = form.elements.namedItem("summary");

    expect(summary).toBeInstanceOf(HTMLTextAreaElement);
    const focused = focusFirstInvalidControl(form);

    expect(focused).toBe(summary);
    expect(document.activeElement).toBe(summary);
    expect(isFormReadyToSubmit(form)).toBe(false);
  });

  it("opens a collapsed criterion card before focusing its invalid control", () => {
    const form = mountForm(`
      <div data-criterion-card data-closed>
        <button type="button" data-slot="collapsible-trigger" aria-expanded="false">Критерий</button>
        <input name="criterion.1.score" required value="" />
      </div>
    `);
    const trigger = form.querySelector("[data-slot='collapsible-trigger']");
    trigger?.addEventListener("click", () => {
      trigger.setAttribute("aria-expanded", "true");
    });

    focusFirstInvalidControl(form);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(form.elements.namedItem("criterion.1.score"));
  });

  it("writes the announcement into an aria-live region", () => {
    const region = document.createElement("div");
    region.setAttribute("aria-live", "assertive");
    document.body.append(region);

    announceToLiveRegion(region, "Заполните все критерии");

    expect(region).toHaveTextContent("Заполните все критерии");
  });
});
