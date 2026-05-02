import { validateScorecardDraft } from "@/lib/scorecard-validation";
import { describe, expect, it } from "vitest";

describe("validateScorecardDraft", () => {
  it("normalizes valid scorecard criteria", () => {
    expect(
      validateScorecardDraft({
        name: " Новая QA скоркарта ",
        criteria: [
          {
            key: " Accuracy ",
            label: " Точность ",
            kind: "SCALE_1_3",
            weight: 70,
            required: true,
            order: 1
          },
          {
            key: "policy_check",
            label: "Политика",
            kind: "PASS_FAIL",
            weight: 30,
            required: false,
            order: 2
          }
        ]
      })
    ).toEqual({
      name: "Новая QA скоркарта",
      criteria: [
        {
          key: "accuracy",
          label: "Точность",
          kind: "SCALE_1_3",
          weight: 70,
          required: true,
          order: 1
        },
        {
          key: "policy_check",
          label: "Политика",
          kind: "PASS_FAIL",
          weight: 30,
          required: false,
          order: 2
        }
      ]
    });
  });

  it("rejects criteria when total weight is not 100", () => {
    expect(() =>
      validateScorecardDraft({
        name: "QA",
        criteria: [
          {
            key: "accuracy",
            label: "Точность",
            kind: "SCALE_1_3",
            weight: 60,
            required: true,
            order: 1
          }
        ]
      })
    ).toThrow("Сумма весов критериев должна быть 100%.");
  });

  it("rejects duplicate criterion keys", () => {
    expect(() =>
      validateScorecardDraft({
        name: "QA",
        criteria: [
          {
            key: "accuracy",
            label: "Точность",
            kind: "SCALE_1_3",
            weight: 50,
            required: true,
            order: 1
          },
          {
            key: "accuracy",
            label: "Повтор",
            kind: "SCALE_1_3",
            weight: 50,
            required: true,
            order: 2
          }
        ]
      })
    ).toThrow('Ключ критерия "accuracy" повторяется.');
  });
});
