import type { ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";

/**
 * Cross-screen contextual page header + content frame.
 *
 * Every screen opens the same way: a quiet uppercase eyebrow kicker, an <h1>
 * title, an optional one-line description, and a right-aligned `actions` slot
 * for the primary action. An optional in-page segmented `tabs` row sits below
 * the header for sub-navigation. The content frame caps width at
 * `--content-max-width` and uses the page padding tokens so every page lines up
 * with the app chrome. Clean, modern, token-driven (no raw hex) — holds across
 * every theme including Night Ops. Russian-friendly: callers pass the copy.
 *
 * All styling lives in `src/app/styles/components/07-shell.css` under
 * `.page-shell*`.
 */
export type PageShellTab = {
  label: ReactNode;
  href: string;
  active?: boolean;
  /** Optional count pill rendered after the label. */
  count?: number;
};

export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  tabs,
  children,
  className
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tabs?: PageShellTab[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("page-shell", className)}>
      <header className="page-shell__header">
        <div className="page-shell__heading">
          {eyebrow != null ? <p className="page-shell__eyebrow">{eyebrow}</p> : null}
          <h1 className="page-shell__title">{title}</h1>
          {description != null ? (
            <p className="page-shell__description">{description}</p>
          ) : null}
        </div>
        {actions != null ? <div className="page-shell__actions">{actions}</div> : null}
      </header>

      {tabs && tabs.length > 0 ? (
        <nav className="page-shell__tabs" aria-label="Разделы страницы">
          {tabs.map((tab, index) => (
            <Link
              key={`${tab.href}:${index}`}
              href={tab.href}
              className={clsx("page-shell__tab", tab.active && "page-shell__tab--active")}
              aria-current={tab.active ? "page" : undefined}
            >
              <span className="page-shell__tab-label">{tab.label}</span>
              {tab.count != null ? (
                <span className="page-shell__tab-count">{tab.count}</span>
              ) : null}
            </Link>
          ))}
        </nav>
      ) : null}

      {children != null ? <div className="page-shell__content">{children}</div> : null}
    </div>
  );
}
