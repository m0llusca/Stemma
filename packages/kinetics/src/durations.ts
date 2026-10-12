/** Canonical duration values for animation and timer consumers. Keep CSS mirrors in tokens.css in sync. */

export const kineticsDurations = {
  spring: "400ms",
  springEnter: "550ms",
  springPanel: "450ms",
  springGlide: "400ms",
  morph: "350ms",
  shimmer: "1.5s"
} as const;

/**
 * Millisecond mirrors for JS APIs (scroll timers, Recharts, Morphicons windows).
 * Keep in sync with `kineticsDurations` / `tokens.css`.
 */
export const kineticsDurationMs = {
  spring: 400,
  springEnter: 550,
  springPanel: 450,
  springGlide: 400,
  morph: 350,
  shimmer: 1500,
  /** Transient evidence / focus flash (product timing, not a Colorion demo). */
  feedbackFlash: 1200
} as const;
