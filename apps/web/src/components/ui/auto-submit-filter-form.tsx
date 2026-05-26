"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useRef, useTransition } from "react";

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

    if (!normalizedValue || (key === "status" && normalizedValue === "all")) {
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

        startTransition(() => {
          router.push(filterFormUrl(form, action));
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
      className={className}
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
    </form>
  );
}
