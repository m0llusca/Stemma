"use client";

import { UserRoundCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const summaryClassName =
  "flex w-full cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-foreground outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Demo-login disclosure. Native `<details>`/`<summary role="button">` stamp
 * UA attributes (`aria-expanded`, `open`) that do not match the SSR HTML
 * (`react-hydration-error` on `/auth/login`). Chrome + the first client
 * frame render the same static label; details mounts after the effect.
 */
export function DemoLoginDisclosure({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const summary = (
    <>
      <UserRoundCheck className="size-3.5 text-muted-foreground" aria-hidden="true" />
      Демо-вход
    </>
  );

  if (!mounted) {
    return (
      <div className="w-full">
        <div className={summaryClassName}>{summary}</div>
      </div>
    );
  }

  return (
    <details className="w-full">
      <summary role="button" className={summaryClassName}>
        {summary}
      </summary>
      {children}
    </details>
  );
}
