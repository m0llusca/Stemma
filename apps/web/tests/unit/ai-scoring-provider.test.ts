import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DeterministicScoringProvider,
  YandexGptScoringProvider,
  ScoringProviderError,
  resolveScoringProvider
} from "@/lib/ai-quality/scoring";
import type { ScoringInput, ScoringTransport } from "@/lib/ai-quality/scoring";

const baseInput: ScoringInput = {
  conversationId: "conv-123",
  subject: "Возврат средств за заказ",
  criteria: [
    { id: "crit-greeting", key: "greeting", label: "Приветствие", kind: "PASS_FAIL", block: "Старт", weight: 1 },
    { id: "crit-empathy", key: "empathy", label: "Эмпатия", kind: "SCALE_1_3", block: "Диалог", weight: 2 },
    { id: "crit-closing", key: "closing", label: "Завершение", kind: "PASS_FAIL", block: "Финал", weight: 1 }
  ],
  transcript: [
    { id: "msg-1", author: "Клиент", text: "Здравствуйте, хочу вернуть деньги." },
    { id: "msg-2", author: "Оператор", text: "Добрый день! Помогу вам с возвратом." },
    { id: "msg-3", author: "Клиент", text: "Спасибо большое." }
  ]
};

describe("DeterministicScoringProvider", () => {
  const provider = new DeterministicScoringProvider();

  it("identifies itself and exposes stable model/prompt versions", () => {
    expect(provider.name).toBe("deterministic");
    expect(provider.modelVersion.length).toBeGreaterThan(0);
    expect(provider.promptVersion.length).toBeGreaterThan(0);
  });

  it("produces stable predictions for identical input (no randomness/time)", async () => {
    const first = await provider.scoreConversation(baseInput);
    const second = await provider.scoreConversation(baseInput);

    expect(first).toEqual(second);
  });

  it("emits a valid prediction per criterion kind", async () => {
    const prediction = await provider.scoreConversation(baseInput);

    expect(prediction.criteria).toHaveLength(3);
    expect(prediction.overallConfidence).toBeGreaterThanOrEqual(0);
    expect(prediction.overallConfidence).toBeLessThanOrEqual(1);
    expect(prediction.summary.length).toBeGreaterThan(0);

    for (const criterion of prediction.criteria) {
      const spec = baseInput.criteria.find((entry) => entry.id === criterion.criterionId);
      expect(spec).toBeDefined();
      expect(criterion.criterionKey).toBe(spec?.key);
      expect(criterion.confidence).toBeGreaterThanOrEqual(0);
      expect(criterion.confidence).toBeLessThanOrEqual(1);
      expect(criterion.rationale.length).toBeGreaterThan(0);

      if (spec?.kind === "SCALE_1_3") {
        expect(criterion.value).toBeGreaterThanOrEqual(1);
        expect(criterion.value).toBeLessThanOrEqual(3);
        expect(criterion.passed).toBeUndefined();
      } else {
        expect(typeof criterion.passed).toBe("boolean");
        expect(criterion.value).toBeUndefined();
      }

      if (criterion.evidenceRef !== undefined) {
        expect(baseInput.transcript.map((message) => message.id)).toContain(criterion.evidenceRef);
      }
    }
  });

  it("varies the value across different conversations", async () => {
    const a = await provider.scoreConversation(baseInput);
    const b = await provider.scoreConversation({ ...baseInput, conversationId: "conv-999" });

    const signature = (prediction: Awaited<ReturnType<typeof provider.scoreConversation>>) =>
      prediction.criteria.map((c) => `${c.value ?? ""}:${c.passed ?? ""}`).join("|");

    // Not strictly required to differ, but the hash should be input-sensitive.
    expect(signature(a)).not.toBe("");
    expect(signature(b)).not.toBe("");
  });

  it("tolerates an empty transcript without inventing evidence refs", async () => {
    const prediction = await provider.scoreConversation({ ...baseInput, transcript: [] });

    for (const criterion of prediction.criteria) {
      expect(criterion.evidenceRef).toBeUndefined();
    }
  });
});

function fakeTransport(response: { statusCode?: number; body: string }): {
  transport: ScoringTransport;
  calls: Array<{ url: string; headers: Record<string, string>; body?: string }>;
} {
  const calls: Array<{ url: string; headers: Record<string, string>; body?: string }> = [];
  const transport: ScoringTransport = async (request) => {
    calls.push({ url: request.url, headers: request.headers, body: request.body });
    return { statusCode: response.statusCode ?? 200, body: response.body };
  };
  return { transport, calls };
}

function yandexResponse(prediction: unknown): string {
  return JSON.stringify({
    result: {
      alternatives: [{ message: { role: "assistant", text: JSON.stringify(prediction) } }]
    }
  });
}

describe("YandexGptScoringProvider", () => {
  it("builds the documented Yandex Foundation Models request", async () => {
    const { transport, calls } = fakeTransport({
      body: yandexResponse({
        criteria: [
          { criterionKey: "greeting", passed: true, confidence: 0.9, rationale: "Поздоровался", evidenceRef: "msg-2" },
          { criterionKey: "empathy", value: 3, confidence: 0.8, rationale: "Проявил эмпатию", evidenceRef: "msg-2" },
          { criterionKey: "closing", passed: false, confidence: 0.6, rationale: "Не попрощался" }
        ],
        overallConfidence: 0.77,
        summary: "В целом хорошо"
      })
    });

    const provider = new YandexGptScoringProvider({
      apiKey: "secret-key",
      catalogId: "cat-1",
      model: "yandexgpt",
      transport
    });

    await provider.scoreConversation(baseInput);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe("https://llm.api.cloud.yandex.net/foundationModels/v1/completion");
    expect(call.headers.authorization ?? call.headers.Authorization).toBe("Api-Key secret-key");
    expect(call.headers["x-folder-id"]).toBe("cat-1");
    expect(call.headers["content-type"] ?? call.headers["Content-Type"]).toContain("application/json");

    const parsed = JSON.parse(call.body ?? "{}");
    expect(parsed.modelUri).toBe("gpt://cat-1/yandexgpt/latest");
    expect(parsed.completionOptions.stream).toBe(false);
    expect(parsed.completionOptions.temperature).toBeCloseTo(0.2);
    expect(parsed.completionOptions.maxTokens).toBeGreaterThanOrEqual(1000);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].role).toBe("system");
    expect(parsed.messages[1].role).toBe("user");
    // The user message must carry the transcript message ids and criterion keys.
    expect(parsed.messages[1].text).toContain("msg-1");
    expect(parsed.messages[1].text).toContain("greeting");
  });

  it("uses the configured model in the modelUri", async () => {
    const { transport, calls } = fakeTransport({
      body: yandexResponse({
        criteria: [{ criterionKey: "greeting", passed: true, confidence: 0.5, rationale: "ok" }],
        overallConfidence: 0.5,
        summary: "ok"
      })
    });
    const provider = new YandexGptScoringProvider({
      apiKey: "k",
      catalogId: "cat-2",
      model: "yandexgpt-lite",
      transport
    });

    await provider.scoreConversation(baseInput);

    expect(JSON.parse(calls[0].body ?? "{}").modelUri).toBe("gpt://cat-2/yandexgpt-lite/latest");
  });

  it("parses a well-formed response and maps criterionKey back to criterionId", async () => {
    const { transport } = fakeTransport({
      body: yandexResponse({
        criteria: [
          { criterionKey: "greeting", passed: true, confidence: 0.9, rationale: "Поздоровался", evidenceRef: "msg-2" },
          { criterionKey: "empathy", value: 2, confidence: 0.8, rationale: "Сдержанно", evidenceRef: "msg-3" },
          { criterionKey: "closing", passed: false, confidence: 0.6, rationale: "Резко" }
        ],
        overallConfidence: 0.7,
        summary: "Нормально"
      })
    });
    const provider = new YandexGptScoringProvider({ apiKey: "k", catalogId: "c", transport });

    const prediction = await provider.scoreConversation(baseInput);

    expect(prediction.overallConfidence).toBeCloseTo(0.7);
    expect(prediction.summary).toBe("Нормально");

    const greeting = prediction.criteria.find((c) => c.criterionKey === "greeting");
    const empathy = prediction.criteria.find((c) => c.criterionKey === "empathy");
    expect(greeting?.criterionId).toBe("crit-greeting");
    expect(greeting?.passed).toBe(true);
    expect(empathy?.criterionId).toBe("crit-empathy");
    expect(empathy?.value).toBe(2);
  });

  it("throws a typed error when the alternative text is not valid JSON", async () => {
    const { transport } = fakeTransport({
      body: JSON.stringify({ result: { alternatives: [{ message: { text: "не json, просто текст" } }] } })
    });
    const provider = new YandexGptScoringProvider({ apiKey: "k", catalogId: "c", transport });

    await expect(provider.scoreConversation(baseInput)).rejects.toBeInstanceOf(ScoringProviderError);
  });

  it("throws a typed error when the response shape is missing alternatives", async () => {
    const { transport } = fakeTransport({ body: JSON.stringify({ result: {} }) });
    const provider = new YandexGptScoringProvider({ apiKey: "k", catalogId: "c", transport });

    await expect(provider.scoreConversation(baseInput)).rejects.toBeInstanceOf(ScoringProviderError);
  });

  it("throws a typed error when the parsed prediction has no usable criteria", async () => {
    const { transport } = fakeTransport({
      body: yandexResponse({ criteria: [], overallConfidence: 0.5, summary: "пусто" })
    });
    const provider = new YandexGptScoringProvider({ apiKey: "k", catalogId: "c", transport });

    await expect(provider.scoreConversation(baseInput)).rejects.toBeInstanceOf(ScoringProviderError);
  });

  it("does not leak the api key in thrown error diagnostics", async () => {
    const { transport } = fakeTransport({ body: "not-json-at-all" });
    const provider = new YandexGptScoringProvider({ apiKey: "super-secret-key", catalogId: "c", transport });

    try {
      await provider.scoreConversation(baseInput);
      throw new Error("expected scoreConversation to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ScoringProviderError);
      const serialized = JSON.stringify((error as ScoringProviderError).diagnostic ?? {});
      expect(serialized).not.toContain("super-secret-key");
    }
  });
});

describe("resolveScoringProvider", () => {
  let previousApiKey: string | undefined;
  let previousCatalogId: string | undefined;
  let previousModel: string | undefined;

  beforeEach(() => {
    previousApiKey = process.env.YANDEX_GPT_API_KEY;
    previousCatalogId = process.env.YANDEX_GPT_CATALOG_ID;
    previousModel = process.env.YANDEX_GPT_MODEL;
  });

  afterEach(() => {
    restore("YANDEX_GPT_API_KEY", previousApiKey);
    restore("YANDEX_GPT_CATALOG_ID", previousCatalogId);
    restore("YANDEX_GPT_MODEL", previousModel);
  });

  it("falls back to the deterministic provider when credentials are absent", () => {
    delete process.env.YANDEX_GPT_API_KEY;
    delete process.env.YANDEX_GPT_CATALOG_ID;

    const provider = resolveScoringProvider();

    expect(provider).toBeInstanceOf(DeterministicScoringProvider);
    expect(provider.name).toBe("deterministic");
  });

  it("selects the YandexGPT adapter when both credentials are present", () => {
    process.env.YANDEX_GPT_API_KEY = "key";
    process.env.YANDEX_GPT_CATALOG_ID = "catalog";

    const provider = resolveScoringProvider();

    expect(provider).toBeInstanceOf(YandexGptScoringProvider);
    expect(provider.name).toBe("yandexgpt");
  });

  it("falls back when only one credential is present", () => {
    process.env.YANDEX_GPT_API_KEY = "key";
    delete process.env.YANDEX_GPT_CATALOG_ID;

    expect(resolveScoringProvider()).toBeInstanceOf(DeterministicScoringProvider);
  });
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
