import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * Cross-screen empty / zero-data primitive.
 *
 * Replaces giant gray "Нет данных" blocks with a calm, centered state: a small
 * mono `--text-muted` icon, one-line title in `--foreground`, an optional
 * one-line description, and at most ONE action. Minimal chrome, no big gray
 * fill — works inside panels (`inline`) and as a full-section state (`block`).
 * Russian-friendly: the caller passes the copy. All styling lives in
 * `src/app/styles/components/06-data.css` and is token-driven (no raw hex), so
 * it holds across every theme including Night Ops.
 */
export type EmptyStateSize = "inline" | "block";

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "block",
  className
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  size?: EmptyStateSize;
  className?: string;
}) {
  return (
    <div className={clsx("empty-state", `empty-state--${size}`, className)}>
      {icon != null ? (
        <span className="empty-state__icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <p className="empty-state__title">{title}</p>
      {description != null ? (
        <p className="empty-state__description">{description}</p>
      ) : null}
      {action != null ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
