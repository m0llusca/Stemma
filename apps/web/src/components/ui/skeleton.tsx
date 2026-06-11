import type { CSSProperties, HTMLAttributes } from "react";

const skeletonBackground = "color-mix(in srgb, var(--muted) 18%, var(--panel))";

export function Skeleton({
  className = "",
  style,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={`motion-safe:animate-pulse ${className}`.trim()}
      style={{
        backgroundColor: skeletonBackground,
        borderRadius: "var(--radius-card)",
        ...style
      } as CSSProperties}
      {...props}
    />
  );
}
