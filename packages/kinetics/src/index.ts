/**
 * Published Kinetics spring values as JS constants.
 * CSS custom properties live in `./tokens.css` and remain the runtime source of truth.
 */

export const KINETICS_ORIGIN = "https://kinetics.colorion.co/#library" as const;

/** Package identity — Colorion Kinetics is not on npm; this is Stemma's catalog. */
export const KINETICS_PACKAGE = "@stemma/kinetics" as const;

export const kineticsDurations = {
  spring: "400ms",
  springEnter: "550ms",
  springPanel: "450ms",
  springGlide: "400ms",
  morph: "350ms",
  shimmer: "1.5s"
} as const;

export const kineticsEasings = {
  /** Switch / progress overshoot spring. */
  overshoot: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  /** Toast entrance spring. */
  toast: "cubic-bezier(0.18, 1.25, 0.4, 1)",
  /** Panel / sheet / accordion settle. */
  panel: "cubic-bezier(0.16, 1, 0.3, 1)",
  /** Tab / toggle pill glide. */
  glide: "cubic-bezier(0.65, 0, 0.35, 1)",
  /** Badge / status morph settle. */
  gentle: "cubic-bezier(0.2, 0.8, 0.2, 1)"
} as const;

export type KineticsSpringPreset =
  | "overshoot"
  | "toast"
  | "panel"
  | "glide"
  | "morph"
  | "enter";

const presetCssVar: Record<
  KineticsSpringPreset,
  { duration: string; easing: string }
> = {
  overshoot: {
    duration: "var(--motion-duration-spring)",
    easing: "var(--motion-ease-spring-overshoot)"
  },
  toast: {
    duration: "var(--motion-duration-spring-enter)",
    easing: "var(--motion-ease-spring-toast)"
  },
  panel: {
    duration: "var(--motion-duration-spring-panel)",
    easing: "var(--motion-ease-spring-panel)"
  },
  glide: {
    duration: "var(--motion-duration-spring-glide)",
    easing: "var(--motion-ease-spring-glide)"
  },
  morph: {
    duration: "var(--motion-duration-morph)",
    easing: "var(--motion-ease-spring-gentle)"
  },
  enter: {
    duration: "var(--motion-duration-spring-enter)",
    easing: "var(--motion-ease-spring-panel)"
  }
};

/**
 * CSS transition fragments for inline styles / style objects.
 * Prefer Tailwind `duration-[var(--motion-duration-spring)]` in components.
 */
export function kineticsTransition(
  properties: string,
  preset: KineticsSpringPreset = "panel"
): string {
  const { duration, easing } = presetCssVar[preset];
  return `${properties} ${duration} ${easing}`;
}

export type KineticsSurface =
  | "toast"
  | "switch"
  | "kpi"
  | "skeleton"
  | "badge"
  | "accordion"
  | "tabs"
  | "chart-enter"
  | "progress"
  | "checkbox"
  | "radio"
  | "toggle"
  | "sheet"
  | "dialog"
  | "alert-dialog"
  | "hover-lift"
  | "icon-morph"
  | "top-nav";

/** Product surfaces that intentionally consume the Kinetics catalog. */
export const kineticsSurfaces: readonly KineticsSurface[] = [
  "toast",
  "switch",
  "kpi",
  "skeleton",
  "badge",
  "accordion",
  "tabs",
  "chart-enter",
  "progress",
  "checkbox",
  "radio",
  "toggle",
  "sheet",
  "dialog",
  "alert-dialog",
  "hover-lift",
  "icon-morph",
  "top-nav"
] as const;

export {
  kineticsDurations as durations,
  kineticsEasings as easings
};
