import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AnthropicScoringProvider,
  DeterministicScoringProvider,
  OpenAiScoringProvider,
  ScoringProviderError,
  YandexGptScoringProvider,
  resolveAiScoringProviderName,
  resolveScoringProvider,
  type ScoringInput,
  type ScoringTransport,
  type ScoringTransportRequest
} from "@/lib/ai-quality/scoring";

const input: ScoringInput = {
  conversationId: "conv-1",
  subject: "Статус заявки",
  criteria: [
    { id: "crit-1", key: "greeting", label: "Приветствие", kind: "SCALE_1_3", block: "Общее", weight: 1 },
    { id: "crit-2", key: "resolved", label: "Решение", kind: "PASS_FAIL", block: "Итог", weight: 2 }
  ],
  transcript: [
    { id: "m1", author: "Оператор", text: "Здравствуйте, помогу вам." },
    { id: "m2", author: "Клиент", text: "Спасибо!" }
  ]
};

const predictionJson = JSON.stringify({
  criteria: [
    { criterionKey: "greeting", value: 3, isNotApplicable: false, confidence: 0.9, rationale: "Поздоровался", evidenceRef: "m1" },
    { criterionKey: "resolved", passed: true, isNotApplicable: false, confidence: 0.8, rationale: "Решил", evidenceRef: "m2" }
  ],
  overallConfidence: 0.85,
  summary: "Хороший диалог",
  sentiment: { label: "positive", score: 0.7 }
});

function recordingTransport(response: { statusCode: number; body: string }) {
  const calls: ScoringTransportRequest[] = [];
  const transport: ScoringTransport = async (request) => {
    calls.push(request);
    return { statusCode: response.statusCode, body: response.body };
  };
  return { transport, calls };
}

describe("AnthropicScoringProvider", () => {
  it("builds the Messages API request and parses a well-formed response", async () => {
    const { transport, calls } = recordingTransport({
      statusCode: 200,
      body: JSON.stringify({ content: [{ type: "text", text: predictionJson }], stop_reason: "end_turn" })
    });
    const provider = new AnthropicScoringProvider({ apiKey: "sk-ant-test", transport });

    const prediction = await provider.scoreConversation(input);

    expect(calls).toHaveLength(1);
    const request = calls[0];
    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers["x-api-key"]).toBe("sk-ant-test");
    expect(request.headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(request.body ?? "{}");
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.temperature).toBeUndefined();
    expect(body.thinking).toBeUndefined();
    expect(typeof body.system).toBe("string");
    expect(body.messages[0].role).toBe("user");

    expect(provider.name).toBe("anthropic");
    expect(provider.modelVersion).toBe("claude-opus-4-8");
    expect(prediction.criteria).toHaveLength(2);
    const greeting = prediction.criteria.find((c) => c.criterionId === "crit-1");
    expect(greeting?.value).toBe(3);
    expect(greeting?.passed).toBeUndefined();
    expect(prediction.sentiment?.label).toBe("positive");
  });

  it("throws when the model refuses (stop_reason refusal)", async () => {
    const { transport } = recordingTransport({
      statusCode: 200,
      body: JSON.stringify({ content: [], stop_reason: "refusal", stop_details: { category: "cyber" } })
    });
    const provider = new AnthropicScoringProvider({ apiKey: "sk-ant-test", transport });

    await expect(provider.scoreConversation(input)).rejects.toBeInstanceOf(ScoringProviderError);
  });

  it("throws when the text block is not valid prediction JSON", async () => {
    const { transport } = recordingTransport({
      statusCode: 200,
      body: JSON.stringify({ content: [{ type: "text", text: "не json" }], stop_reason: "end_turn" })
    });
    const provider = new AnthropicScoringProvider({ apiKey: "sk-ant-test", transport });

    await expect(provider.scoreConversation(input)).rejects.toBeInstanceOf(ScoringProviderError);
  });

  it("honors a custom model id", async () => {
    const { transport, calls } = recordingTransport({
      statusCode: 200,
      body: JSON.stringify({ content: [{ type: "text", text: predictionJson }], stop_reason: "end_turn" })
    });
    const provider = new AnthropicScoringProvider({ apiKey: "k", model: "claude-sonnet-4-6", transport });
    await provider.scoreConversation(input);
    expect(JSON.parse(calls[0].body ?? "{}").model).toBe("claude-sonnet-4-6");
    expect(provider.modelVersion).toBe("claude-sonnet-4-6");
  });
});

describe("OpenAiScoringProvider", () => {
  it("builds the Chat Completions request (JSON mode) and parses the response", async () => {
    const { transport, calls } = recordingTransport({
      statusCode: 200,
      body: JSON.stringify({ choices: [{ message: { content: predictionJson }, finish_reason: "stop" }] })
    });
    const provider = new OpenAiScoringProvider({ apiKey: "sk-openai-test", organization: "org-1", transport });

    const prediction = await provider.scoreConversation(input);

    const request = calls[0];
    expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(request.headers.authorization).toBe("Bearer sk-openai-test");
    expect(request.headers["openai-organization"]).toBe("org-1");
    const body = JSON.parse(request.body ?? "{}");
    expect(body.model).toBe("gpt-4o");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");

    expect(provider.name).toBe("openai");
    expect(prediction.criteria).toHaveLength(2);
    const resolved = prediction.criteria.find((c) => c.criterionId === "crit-2");
    expect(resolved?.passed).toBe(true);
    expect(resolved?.value).toBeUndefined();
  });

  it("throws when the choice content is not valid prediction JSON", async () => {
    const { transport } = recordingTransport({
      statusCode: 200,
      body: JSON.stringify({ choices: [{ message: { content: "{}" } }] })
    });
    const provider = new OpenAiScoringProvider({ apiKey: "k", transport });
    await expect(provider.scoreConversation(input)).rejects.toBeInstanceOf(ScoringProviderError);
  });
});

describe("resolveScoringProvider selection", () => {
  const keys = ["YANDEX_GPT_API_KEY", "YANDEX_GPT_CATALOG_ID", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it("picks the explicitly chosen provider when its credentials are present", () => {
    process.env.ANTHROPIC_API_KEY = "k";
    expect(resolveAiScoringProviderName("anthropic")).toBe("anthropic");
    expect(resolveScoringProvider("anthropic")).toBeInstanceOf(AnthropicScoringProvider);

    process.env.OPENAI_API_KEY = "k";
    expect(resolveScoringProvider("openai")).toBeInstanceOf(OpenAiScoringProvider);

    process.env.YANDEX_GPT_API_KEY = "k";
    process.env.YANDEX_GPT_CATALOG_ID = "c";
    expect(resolveScoringProvider("yandexgpt")).toBeInstanceOf(YandexGptScoringProvider);
  });

  it("falls back to deterministic when the chosen provider has no credentials", () => {
    expect(resolveAiScoringProviderName("anthropic")).toBe("deterministic");
    expect(resolveScoringProvider("anthropic")).toBeInstanceOf(DeterministicScoringProvider);
  });

  it("always uses deterministic when explicitly chosen, even with credentials", () => {
    process.env.ANTHROPIC_API_KEY = "k";
    expect(resolveScoringProvider("deterministic")).toBeInstanceOf(DeterministicScoringProvider);
  });

  it("auto picks the first configured in priority order yandex > anthropic > openai", () => {
    process.env.OPENAI_API_KEY = "k";
    expect(resolveAiScoringProviderName("auto")).toBe("openai");
    process.env.ANTHROPIC_API_KEY = "k";
    expect(resolveAiScoringProviderName("auto")).toBe("anthropic");
    process.env.YANDEX_GPT_API_KEY = "k";
    process.env.YANDEX_GPT_CATALOG_ID = "c";
    expect(resolveAiScoringProviderName("auto")).toBe("yandexgpt");
    expect(resolveAiScoringProviderName(undefined)).toBe("yandexgpt");
  });

  it("auto with nothing configured is deterministic", () => {
    expect(resolveScoringProvider()).toBeInstanceOf(DeterministicScoringProvider);
    expect(resolveAiScoringProviderName("auto")).toBe("deterministic");
  });
});

describe("resolveScoringProvider credential injection (DB over env)", () => {
  const keys = ["YANDEX_GPT_API_KEY", "YANDEX_GPT_CATALOG_ID", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it("uses an injected key when no env var is set", () => {
    expect(resolveAiScoringProviderName("anthropic", { anthropic: { apiKey: "db-key" } })).toBe("anthropic");
    expect(resolveScoringProvider("anthropic", { anthropic: { apiKey: "db-key" } })).toBeInstanceOf(AnthropicScoringProvider);
  });

  it("requires both key and catalog id for YandexGPT", () => {
    expect(resolveAiScoringProviderName("yandexgpt", { yandexgpt: { apiKey: "db-key" } })).toBe("deterministic");
    expect(resolveAiScoringProviderName("yandexgpt", { yandexgpt: { apiKey: "db-key", catalogId: "cat" } })).toBe("yandexgpt");
  });

  it("auto picks an injected provider", () => {
    expect(resolveAiScoringProviderName("auto", { openai: { apiKey: "db-key" } })).toBe("openai");
    expect(resolveScoringProvider("auto", { openai: { apiKey: "db-key" } })).toBeInstanceOf(OpenAiScoringProvider);
  });

  it("respects auto priority when both env and injected keys exist", () => {
    process.env.OPENAI_API_KEY = "env-openai";
    // openai from env + anthropic injected → anthropic wins (yandex > anthropic > openai).
    expect(resolveAiScoringProviderName("auto", { anthropic: { apiKey: "db-anthropic" } })).toBe("anthropic");
  });

  it("ignores empty injected values and falls through to deterministic", () => {
    expect(resolveAiScoringProviderName("anthropic", { anthropic: { apiKey: "" } })).toBe("deterministic");
    expect(resolveAiScoringProviderName("auto", {})).toBe("deterministic");
  });
});
