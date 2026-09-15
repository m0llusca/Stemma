import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestElementProps = {
  children?: React.ReactNode;
  className?: string;
  style?: Record<string, string>;
  [key: string]: unknown;
};
type TestElement = ReactElement<TestElementProps>;

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAuthEntryRequest: vi.fn(async () => false),
  ToastProvider: vi.fn(({ children }: { children: React.ReactNode }) => children),
  TooltipProvider: vi.fn(({ children }: { children: React.ReactNode }) => children)
}));

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "font-sans-test" }),
  JetBrains_Mono: () => ({ variable: "font-mono-test" })
}));

vi.mock("@/components/app-nav", () => ({
  AppNav: () => null
}));

vi.mock("@/components/ui/toast", () => ({
  ToastProvider: mocks.ToastProvider
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: mocks.TooltipProvider
}));

vi.mock("@/lib/auth/request-path", () => ({
  isAuthEntryRequest: mocks.isAuthEntryRequest
}));

vi.mock("@/lib/current-user", () => {
  class AuthRequiredError extends Error {}

  return {
    AuthRequiredError,
    getCurrentUser: mocks.getCurrentUser
  };
});

function bodyFrom(root: TestElement) {
  const children = Array.isArray(root.props.children)
    ? root.props.children
    : [root.props.children];

  return children.find(
    (child): child is TestElement =>
      Boolean(child && typeof child === "object" && "type" in child && child.type === "body")
  );
}

describe("RootLayout appearance ownership", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getCurrentUser.mockReset();
    mocks.isAuthEntryRequest.mockReset();
    mocks.isAuthEntryRequest.mockResolvedValue(false);
    mocks.ToastProvider.mockClear();
    mocks.TooltipProvider.mockClear();
  });

  it("places the full dark appearance and inline overrides on html only", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      workspace: {
        uiTheme: "ops",
        uiDensity: "compact",
        uiCorners: "sharp",
        uiContrast: "high",
        brandPrimaryColor: "#123456",
        brandAccentColor: "#abcdef",
        uiPaletteOverridesJson: JSON.stringify({
          buttonPrimaryBg: "#345678"
        })
      }
    });
    const { default: RootLayout } = await import("@/app/layout");

    const root = (await RootLayout({ children: <main>content</main> })) as TestElement;
    const body = bodyFrom(root);

    expect(root.type).toBe("html");
    expect(root.props).toMatchObject({
      "data-theme": "ops",
      "data-density": "compact",
      "data-corners": "sharp",
      "data-contrast": "high",
      className: expect.stringContaining("dark"),
      style: {
        colorScheme: "dark",
        "--brand-primary": "#123456",
        "--brand-accent": "#abcdef",
        "--button-primary-bg": "#345678",
        "--primary": "#345678"
      }
    });
    expect(body).toBeDefined();
    expect(body?.props.style).toBeUndefined();
    expect(body?.props["data-theme"]).toBeUndefined();
    expect(body?.props["data-density"]).toBeUndefined();
    expect(body?.props["data-corners"]).toBeUndefined();
    expect(body?.props["data-contrast"]).toBeUndefined();
  });

  it("renders a normalized light root without a stale dark class", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      workspace: {
        uiTheme: "not-a-theme",
        uiDensity: "not-a-density",
        uiCorners: "not-corners",
        uiContrast: "not-contrast"
      }
    });
    const { default: RootLayout } = await import("@/app/layout");

    const root = (await RootLayout({ children: null })) as TestElement;

    expect(root.props["data-theme"]).toBe("graphite");
    expect(root.props["data-density"]).toBe("comfortable");
    expect(root.props["data-corners"]).toBe("medium");
    expect(root.props["data-contrast"]).toBe("standard");
    expect(root.props.className?.split(/\s+/)).not.toContain("dark");
    expect(root.props.style?.colorScheme).toBe("light");
    expect(root.props.dir).toBe("ltr");
  });

  it("skips toast and tooltip chrome on auth entry so /auth/login hydrates clean", async () => {
    mocks.getCurrentUser.mockResolvedValue({ workspace: {} });
    mocks.isAuthEntryRequest.mockResolvedValue(true);
    const { default: RootLayout } = await import("@/app/layout");

    await RootLayout({ children: <main>login</main> });

    expect(mocks.ToastProvider).not.toHaveBeenCalled();
    expect(mocks.TooltipProvider).not.toHaveBeenCalled();
  });
});
