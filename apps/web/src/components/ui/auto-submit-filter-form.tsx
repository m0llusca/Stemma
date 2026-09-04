"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useTransition } from "react";

import { actionFlowNavigation } from "@/lib/action-result-bridge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type AutoSubmitFilterFormProps = {
  action: string;
  children: ReactNode;
  className?: string;
  debounceMs?: number;
  id?: string;
};

function isTextInput(element: EventTarget | null) {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      (element.type === "search" || element.type === "text" || element.type === ""))
  );
}

function isFilterControl(element: EventTarget | null) {
  return (
    (element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement) &&
    Boolean(element.name)
  );
}

function filterFormUrl(form: HTMLFormElement, action: string) {
  const params = new URLSearchParams();

  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value !== "string") {
      continue;
    }

    const normalizedValue = value.trim();

    if (!normalizedValue || ((key === "status" || key === "qaStatus") && normalizedValue === "all")) {
      continue;
    }

    params.append(key, normalizedValue);
  }

  const query = params.toString();
  return query ? `${action}?${query}` : action;
}

export function AutoSubmitFilterForm({
  action,
  children,
  className,
  debounceMs = 450,
  id
}: AutoSubmitFilterFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<number | null>(null);
  const fallbackRef = useRef<{ target: string; timer: number } | null>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const clearFallback = useCallback(() => {
    if (fallbackRef.current !== null) {
      window.clearTimeout(fallbackRef.current.timer);
      fallbackRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearFallback;
  }, [clearFallback]);

  const submit = useCallback(
    (delay: number) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        const form = formRef.current;

        if (!form) {
          return;
        }

        const targetUrl = filterFormUrl(form, action);

        // Awaiting the navigation keeps the transition `pending` for the whole
        // round-trip, so the affordance below stays visible on a slow network
        // instead of flickering for a single frame. (React 19: state updates
        // only remain a Transition while the async callback is awaited.)
        startTransition(async () => {
          await router.push(targetUrl, { scroll: false });
        });

        // The Next 16.2.x client router can drop the push commit on some page
        // loads; when the address bar has not reached the target shortly after
        // dispatch, force the transition with a full document navigation.
        clearFallback();
        fallbackRef.current = {
          target: targetUrl,
          timer: window.setTimeout(() => {
            fallbackRef.current = null;
            if (
              `${window.location.pathname}${window.location.search}` !== targetUrl
            ) {
              actionFlowNavigation.assign(targetUrl);
            }
          }, 2000)
        };
      }, delay);
    },
    [action, clearFallback, router]
  );

  // A committed navigation renders this form with the target already in the
  // address bar, so the fallback never fires after a healthy push.
  useEffect(() => {
    const pendingFallback = fallbackRef.current;
    if (
      pendingFallback &&
      `${window.location.pathname}${window.location.search}` === pendingFallback.target
    ) {
      clearFallback();
    }
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(0);
  }

  return (
    <form
      ref={formRef}
      id={id}
      action={action}
      className={cn("relative", pending && "cursor-progress", className)}
      data-pending={pending ? "true" : undefined}
      aria-busy={pending}
      onSubmit={handleSubmit}
      onChange={(event) => {
        if (!isFilterControl(event.target) || isTextInput(event.target)) {
          return;
        }

        submit(0);
      }}
      onInput={(event) => {
        if (!isFilterControl(event.target) || !isTextInput(event.target)) {
          return;
        }

        submit(debounceMs);
      }}
    >
      {children}
      {pending ? (
        <span
          className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground"
          data-testid="filter-pending"
          role="status"
        >
          <span
            className="relative block h-1 w-24 overflow-hidden rounded-full bg-primary/15"
            aria-hidden="true"
          >
            <span className="absolute inset-y-0 left-0 w-2/5 animate-pulse rounded-full bg-primary motion-reduce:w-full motion-reduce:animate-none" />
          </span>
          <Spinner className="size-3.5" aria-hidden="true" />
          <span className="min-w-0 whitespace-nowrap">Обновляем результаты…</span>
        </span>
      ) : null}
    </form>
  );
}
