"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useRef, useTransition } from "react";

import styles from "./auto-submit-filter-form.module.css";

type AutoSubmitFilterFormProps = {
  action: string;
  children: ReactNode;
  className?: string;
  debounceMs?: number;
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
  debounceMs = 450
}: AutoSubmitFilterFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<number | null>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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

        // Awaiting the navigation keeps the transition `pending` for the whole
        // round-trip, so the affordance below stays visible on a slow network
        // instead of flickering for a single frame. (React 19: state updates
        // only remain a Transition while the async callback is awaited.)
        startTransition(async () => {
          await router.push(filterFormUrl(form, action), { scroll: false });
        });
      }, delay);
    },
    [action, router]
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(0);
  }

  return (
    <form
      ref={formRef}
      action={action}
      className={className ? `${className} ${styles.form}` : styles.form}
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
          className={styles.pending}
          data-testid="filter-pending"
          role="status"
        >
          <span className={styles.pendingTrack} aria-hidden="true">
            <span className={styles.pendingBar} />
          </span>
          <span className={styles.pendingLabel}>Обновляем результаты…</span>
        </span>
      ) : null}
    </form>
  );
}
