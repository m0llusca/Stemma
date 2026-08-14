import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = process.cwd();
const globalsPath = resolve(appRoot, "src/app/globals.css");
const legacyThemePath = resolve(appRoot, "src/app/styles/theme.css");
const legacyComponentsDir = resolve(appRoot, "src/app/styles/components");
const globals = readFileSync(globalsPath, "utf8");

const themeIds = [
  "graphite",
  "azure",
  "emerald",
  "violet",
  "amber",
  "rose",
  "ops"
] as const;

const requiredThemeTokens = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "destructive-soft",
  "success",
  "success-foreground",
  "success-soft",
  "warning",
  "warning-foreground",
  "warning-soft",
  "border",
  "input",
  "ring",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-volume"
] as const;

function blockFor(selector: string) {
  const start = globals.indexOf(`${selector} {`);
  expect(start, `Missing selector ${selector}`).toBeGreaterThanOrEqual(0);

  const open = globals.indexOf("{", start);
  let depth = 0;

  for (let index = open; index < globals.length; index += 1) {
    if (globals[index] === "{") depth += 1;
    if (globals[index] === "}") depth -= 1;
    if (depth === 0) return globals.slice(open + 1, index);
  }

  throw new Error(`Unclosed CSS block for ${selector}`);
}

function tokenValue(block: string, token: string) {
  return block.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1]?.trim() ?? "";
}

// WCAG contrast math over oklch() tokens: oklch -> linear sRGB -> gamma-encoded
// channels, alpha compositing in encoded space (as the UA does), luminance in
// linear space. Mirrors the e2e contrast certification in
// tests/e2e/appearance-contrast.spec.ts.
const clampChannel = (value: number) => Math.min(1, Math.max(0, value));

function oklchTokenToSrgb(value: string): [number, number, number] {
  const match = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!match) {
    throw new Error(`not an oklch() token: ${value}`);
  }
  const L = Number(match[1]);
  const C = Number(match[2]);
  const hr = (Number(match[3]) * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const linear = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
  return linear.map((channel) =>
    clampChannel(
      channel <= 0.0031308
        ? 12.92 * channel
        : 1.055 * clampChannel(channel) ** (1 / 2.4) - 0.055
    )
  ) as [number, number, number];
}

function compositeOver(
  fg: [number, number, number],
  alpha: number,
  bg: [number, number, number]
): [number, number, number] {
  return fg.map((channel, index) =>
    clampChannel(channel * alpha + bg[index] * (1 - alpha))
  ) as [number, number, number];
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]) {
  const luminance = (encoded: [number, number, number]) => {
    const [r, g, b] = encoded.map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const first = luminance(fg);
  const second = luminance(bg);
  const [lighter, darker] = first >= second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const file = join(directory, entry);
    return statSync(file).isDirectory() ? walk(file) : [file];
  });
}

describe("canonical UI theme contract", () => {
  it.each(themeIds)("%s defines the complete semantic/status/sidebar/chart contract", (theme) => {
    const block = blockFor(`[data-theme="${theme}"]`);

    for (const token of requiredThemeTokens) {
      expect(tokenValue(block, token), `${theme} is missing --${token}`).not.toBe("");
    }
  });

  it("keeps chart roles non-empty, distinct within each theme, and different across themes", () => {
    const chartSignatures = themeIds.map((theme) => {
      const block = blockFor(`[data-theme="${theme}"]`);
      const values = [1, 2, 3, 4, 5].map((slot) =>
        tokenValue(block, `chart-${slot}`)
      );

      expect(new Set(values).size, `${theme} chart roles collapsed`).toBe(5);
      return values.join("|");
    });

    expect(new Set(chartSignatures).size).toBe(themeIds.length);
  });

  it("makes density, corners, contrast, coarse pointer, and motion part of the root contract", () => {
    expect(blockFor('[data-density="compact"]')).toMatch(
      /--control-height:\s*(?!var\(--control-height\))/
    );
    expect(blockFor('[data-density="spacious"]')).toMatch(/--section-gap:/);
    expect(blockFor('[data-corners="sharp"]')).toMatch(/--radius:/);
    expect(blockFor('[data-corners="soft"]')).toMatch(/--radius:/);

    const contrast = blockFor('[data-contrast="high"]');
    expect(contrast).toMatch(/color-mix\(in oklch,/);
    expect(contrast).not.toMatch(/#[0-9a-f]{3,8}\b/i);

    const coarsePointer = blockFor("@media (any-pointer: coarse)");
    expect(coarsePointer).toMatch(/--interactive-min-size:\s*44px/);
    expect(coarsePointer).toMatch(
      /\[data-slot="button"\][\s\S]*min-block-size:\s*var\(--interactive-min-size\)/
    );
    expect(coarsePointer).toMatch(
      /\[data-slot="button"\][\s\S]*min-inline-size:\s*var\(--interactive-min-size\)/
    );
    // P2: every interactive control family — not only slotted primitives —
    // must reach the 44px floor on coarse pointers (plain links, tabs, sheet
    // close buttons, slot-less triggers included).
    const coarseMinSizeRule = coarsePointer.match(
      /([^{}]+)\{\s*min-block-size:\s*var\(--interactive-min-size\);\s*min-inline-size:\s*var\(--interactive-min-size\);\s*\}/
    );
    expect(coarseMinSizeRule, "coarse-pointer min-size rule group").not.toBeNull();
    const coarseSelectors = coarseMinSizeRule?.[1] ?? "";
    for (const selector of [
      '[data-slot="button"]',
      '[data-slot="input"]',
      '[data-slot="native-select"]',
      '[data-slot="tabs-trigger"]',
      '[data-slot="sheet-close"]',
      "a[href]",
      "button",
      "summary",
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="combobox"]'
    ]) {
      expect(
        coarseSelectors,
        `coarse-pointer min-size rule covers ${selector}`
      ).toContain(selector);
    }
    expect(globals).toContain("--motion-duration-feedback: 90ms;");
    expect(globals).toContain("--motion-ease-spring-gentle:");
    expect(globals).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*--motion-duration-standard:\s*1ms/
    );
    // P6: reduced motion must clamp transition durations too, not only
    // animation durations — stock utilities like transition-all otherwise keep
    // 150ms transitions running.
    const reducedMotion = blockFor("@media (prefers-reduced-motion: reduce)");
    expect(reducedMotion).toMatch(/transition-duration:\s*1ms\s*!important/);
    expect(reducedMotion).not.toMatch(/transition-duration:\s*0s/);
    expect(globals).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\[data-slot="skeleton"\][\s\S]*animation:\s*none/
    );
    expect(globals).not.toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*transform:\s*none/
    );
  });

  it("keeps semantic status text and focus rings above WCAG floors in every theme", () => {
    // P3/P4: normal text ≥4.5:1, focus indicators ≥3:1, for all seven themes.
    for (const theme of themeIds) {
      const block = blockFor(`[data-theme="${theme}"]`);
      const read = (name: string) => oklchTokenToSrgb(tokenValue(block, name));
      const dark = theme === "ops";
      const destructive = read("destructive");
      const warning = read("warning");
      const card = read("card");

      expect(
        contrastRatio(destructive, read("destructive-soft")),
        `${theme}: destructive text on destructive-soft`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(
          destructive,
          compositeOver(destructive, dark ? 0.2 : 0.1, card)
        ),
        `${theme}: destructive text on the alpha badge surface`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(warning, read("warning-soft")),
        `${theme}: warning text on warning-soft`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(read("primary-foreground"), read("primary")),
        `${theme}: primary-foreground on solid primary (dense matrix bucket)`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(read("ring"), read("background")),
        `${theme}: focus ring on the app background`
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps essential chart marks (chart-4) at or above the 3:1 non-text floor in every theme", () => {
    // WCAG 1.4.11: the quality-trend target line and the agreement
    // «Ориентир 80%» reference line render in --chart-4. The mark must hold
    // ≥3:1 against both the page background and the card surface it sits on.
    for (const theme of themeIds) {
      const block = blockFor(`[data-theme="${theme}"]`);
      const read = (name: string) => oklchTokenToSrgb(tokenValue(block, name));
      const mark = read("chart-4");

      expect(
        contrastRatio(mark, read("background")),
        `${theme}: chart-4 essential mark on the app background`
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrastRatio(mark, read("card")),
        `${theme}: chart-4 essential mark on the card surface`
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("restores a full-strength token-backed focus ring for primary navigation", () => {
    // P4: the header opts out of the base outline via buttonVariants'
    // outline-none + a 50%-alpha ring that also transitions in late; the
    // scoped rule below reinstates an immediate 2px var(--ring) outline.
    expect(globals).toMatch(
      /\[data-slot="app-nav"\]\s+:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ring\)/
    );
  });

  it("uses token-backed primitive sizing and explicit transition properties", () => {
    const primitiveFiles = [
      "button.tsx",
      "input.tsx",
      "native-select.tsx",
      "textarea.tsx",
      "table.tsx",
      "skeleton.tsx",
      "spinner.tsx",
      "progress.tsx",
      // P6: state-feedback primitives migrated off stock transition-all /
      // transition-* defaults onto the --motion-duration-* tokens, so the
      // reduced-motion token override (1ms) reaches them without relying only
      // on the global !important clamp.
      "badge.tsx",
      "toggle.tsx",
      "switch.tsx",
      "tabs.tsx",
      "checkbox.tsx",
      "accordion.tsx",
      "select.tsx",
      "input-otp.tsx",
      "navigation-menu.tsx",
      "breadcrumb.tsx",
      "item.tsx",
      "page-shell.tsx",
      "scroll-area.tsx",
      "slider.tsx",
      "input-group.tsx",
      "combobox.tsx"
    ].map((file) =>
      readFileSync(resolve(appRoot, "src/components/ui", file), "utf8")
    );
    const combined = primitiveFiles.join("\n");

    expect(combined).toContain("var(--control-height)");
    expect(combined).toContain("var(--control-padding-inline)");
    expect(combined).toContain("var(--table-row-height)");
    expect(combined).toContain('data-qc-motion="static-loop"');
    expect(combined).not.toContain("transition-all");
  });

  it("keeps globals.css as the only theme authority", () => {
    expect(existsSync(legacyThemePath)).toBe(false);
    // The retired pre-shadcn cascade is gone for good, not merely unimported.
    expect(existsSync(legacyComponentsDir)).toBe(false);

    const sourceFiles = walk(resolve(appRoot, "src"));
    const themeImports = sourceFiles
      .filter((file) => /\.(?:css|ts|tsx)$/.test(file))
      .filter((file) => /(?:styles\/theme\.css|theme\.css)/.test(readFileSync(file, "utf8")))
      .map((file) => relative(appRoot, file));
    expect(themeImports).toEqual([]);

    // No bridges left: globals.css is the sole owner of every [data-theme=]
    // selector, so a new one appearing outside it is a regression.
    const externalThemeSelectors = sourceFiles
      .filter((file) => file.endsWith(".css") && file !== globalsPath)
      .filter((file) => /\[data-theme=/.test(readFileSync(file, "utf8")))
      .map((file) => relative(appRoot, file))
      .sort();

    expect(externalThemeSelectors).toEqual([]);
    expect(globals).not.toContain("TEMPORARY LEGACY BRIDGES");
  });
});
