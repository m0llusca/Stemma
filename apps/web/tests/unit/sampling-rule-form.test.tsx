import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SamplingRuleForm } from "@/components/admin/sampling-rule-form";

async function renderForm(targetPercent = 10) {
  render(
    <SamplingRuleForm
      action={vi.fn()}
      channelOptions={[]}
      csatOptions={[]}
      ruleTypeOptions={[{ value: "random", label: "Случайная" }]}
      rule={{ id: "rule-1", name: "Правило", type: "random", targetPercent, priority: 100, isActive: true }}
    />
  );
  const input = screen.getByRole("spinbutton", { name: "Доля, %" }) as HTMLInputElement;
  return { input, slider: await screen.findByRole("slider", { name: "Доля, %" }), form: input.form! };
}

describe("sampling percentage controls", () => {
  // Base UI positions edge-aligned thumbs from real element geometry.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const width = this.dataset.slot === "slider-thumb" ? 12 : 200;
      return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: 12, width, height: 12, toJSON() {} };
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it("keeps exact numeric entry and submits targetPercent only once", async () => {
    const { input, slider, form } = await renderForm(37);
    expect(input).toHaveValue(37);
    expect(slider).toHaveAttribute("aria-valuenow", "37");
    expect(new FormData(form).getAll("targetPercent")).toEqual(["37"]);

    fireEvent.change(input, { target: { value: "42" } });

    expect(input.checkValidity()).toBe(true);
    expect(slider).toHaveAttribute("aria-valuenow", "42");
    expect(new FormData(form).getAll("targetPercent")).toEqual(["42"]);
  });

  it("updates the submitted numeric control with keyboard slider changes", async () => {
    const { input, slider, form } = await renderForm(37);
    fireEvent.keyDown(slider, { key: "ArrowRight" });

    expect(input).toHaveValue(38);
    expect(new FormData(form).getAll("targetPercent")).toEqual(["38"]);
    fireEvent.keyDown(slider, { key: "End" });
    expect(input).toHaveValue(100);
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(input).toHaveValue(100);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(input).toHaveValue(1);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(input).toHaveValue(1);
  });

  it("preserves empty and invalid entry for native validation without clamping the submitted input", async () => {
    const { input, slider, form } = await renderForm();
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue(null);
    expect(new FormData(form).getAll("targetPercent")).toEqual([""]);
    expect(slider).toHaveAttribute("aria-valuenow", "1");

    fireEvent.change(input, { target: { value: "101" } });
    expect(input.checkValidity()).toBe(false);
    expect(new FormData(form).getAll("targetPercent")).toEqual(["101"]);
    expect(slider).toHaveAttribute("aria-valuenow", "100");
    fireEvent.change(input, { target: { value: "0" } });
    expect(input.checkValidity()).toBe(false);
    expect(new FormData(form).getAll("targetPercent")).toEqual(["0"]);

    fireEvent.change(input, { target: { value: "42.125" } });
    expect(input.checkValidity()).toBe(false);
    expect(new FormData(form).getAll("targetPercent")).toEqual(["42.125"]);
    expect(slider).toHaveAttribute("aria-valuenow", "42.125");
  });
});
