import { describe, expect, it } from "vitest";
import { isDeterministicAiModel } from "@/lib/ai-quality/draft-origin";

describe("isDeterministicAiModel", () => {
  it("flags the deterministic fallback model versions", () => {
    expect(isDeterministicAiModel("deterministic-1")).toBe(true);
    expect(isDeterministicAiModel("Deterministic-2")).toBe(true);
    expect(isDeterministicAiModel("  deterministic-1  ")).toBe(true);
  });

  it("does not flag real provider model versions", () => {
    expect(isDeterministicAiModel("claude-opus-4-8")).toBe(false);
    expect(isDeterministicAiModel("gpt-4o")).toBe(false);
    expect(isDeterministicAiModel("yandexgpt/latest")).toBe(false);
  });

  it("handles null/undefined/empty safely", () => {
    expect(isDeterministicAiModel(null)).toBe(false);
    expect(isDeterministicAiModel(undefined)).toBe(false);
    expect(isDeterministicAiModel("")).toBe(false);
  });
});
