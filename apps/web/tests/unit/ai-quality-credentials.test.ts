import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: { aiProviderCredential: { findMany: mocks.findMany } }
}));

// Real secrets module: exercises the genuine encrypt -> store -> decrypt cycle.
import { encryptSecret } from "@/lib/secrets";
import { loadWorkspaceAiCredentials, loadWorkspaceAiCredentialViews } from "@/lib/ai-quality/credentials";

const envKeys = ["YANDEX_GPT_API_KEY", "YANDEX_GPT_CATALOG_ID", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of envKeys) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe("loadWorkspaceAiCredentials", () => {
  it("decrypts the API key and parses non-secret extras per provider", async () => {
    mocks.findMany.mockResolvedValue([
      { provider: "yandexgpt", secretRef: encryptSecret("ya-key"), configJson: JSON.stringify({ catalogId: "cat-1", model: "yandexgpt/latest" }) },
      { provider: "anthropic", secretRef: encryptSecret("sk-ant"), configJson: JSON.stringify({ model: "claude-opus-4-8" }) },
      { provider: "openai", secretRef: encryptSecret("sk-oai"), configJson: JSON.stringify({ organization: "org-9" }) }
    ]);

    const creds = await loadWorkspaceAiCredentials("ws-1");

    expect(creds.yandexgpt).toEqual({ apiKey: "ya-key", catalogId: "cat-1", model: "yandexgpt/latest" });
    expect(creds.anthropic).toEqual({ apiKey: "sk-ant", model: "claude-opus-4-8" });
    expect(creds.openai).toEqual({ apiKey: "sk-oai", organization: "org-9", model: undefined });
  });

  it("treats an undecryptable secretRef as no key without throwing", async () => {
    mocks.findMany.mockResolvedValue([{ provider: "anthropic", secretRef: "v1:bogus:bogus:bogus", configJson: "{}" }]);

    const creds = await loadWorkspaceAiCredentials("ws-1");

    expect(creds.anthropic).toEqual({ apiKey: undefined, model: undefined });
  });

  it("tolerates malformed configJson", async () => {
    mocks.findMany.mockResolvedValue([{ provider: "openai", secretRef: encryptSecret("sk-oai"), configJson: "not json" }]);

    const creds = await loadWorkspaceAiCredentials("ws-1");

    expect(creds.openai).toEqual({ apiKey: "sk-oai", organization: undefined, model: undefined });
  });
});

describe("loadWorkspaceAiCredentialViews", () => {
  it("masks the DB key and reports per-provider status with env fallback", async () => {
    process.env.OPENAI_API_KEY = "env-openai";
    mocks.findMany.mockResolvedValue([
      { provider: "anthropic", secretRef: encryptSecret("sk-ant-1234567890"), configJson: JSON.stringify({ model: "claude-opus-4-8" }) }
    ]);

    const views = await loadWorkspaceAiCredentialViews("ws-1");

    expect(views.anthropic.hasDbKey).toBe(true);
    expect(views.anthropic.maskedDbKey).not.toContain("sk-ant-1234567890");
    expect(views.anthropic.maskedDbKey).toMatch(/\.\.\./);
    expect(views.anthropic.model).toBe("claude-opus-4-8");
    expect(views.anthropic.hasEnvKey).toBe(false);

    expect(views.openai.hasDbKey).toBe(false);
    expect(views.openai.maskedDbKey).toBeNull();
    expect(views.openai.hasEnvKey).toBe(true);

    expect(views.yandexgpt.hasDbKey).toBe(false);
    expect(views.yandexgpt.hasEnvKey).toBe(false);
  });

  it("returns all three providers even with no stored rows", async () => {
    mocks.findMany.mockResolvedValue([]);

    const views = await loadWorkspaceAiCredentialViews("ws-1");

    expect(Object.keys(views).sort()).toEqual(["anthropic", "openai", "yandexgpt"]);
    for (const provider of ["anthropic", "openai", "yandexgpt"] as const) {
      expect(views[provider].hasDbKey).toBe(false);
      expect(views[provider].maskedDbKey).toBeNull();
    }
  });
});
