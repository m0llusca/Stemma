/**
 * Framework-agnostic toast store. The React ToastProvider subscribes to it and
 * renders the live region; callers push success/error toasts through the
 * `useToast()` hook. Keeping the queue logic out of React makes it unit
 * testable and lets the auto-dismiss timing be verified with fake timers.
 */

export type ToastTone = "success" | "error" | "info";

export type ToastInput = {
  tone: ToastTone;
  message: string;
  /** Optional title rendered above the message. */
  title?: string;
  /**
   * Milliseconds before the toast auto-dismisses. `0` keeps it until dismissed
   * manually. Defaults to {@link DEFAULT_TOAST_DURATION_MS}.
   */
  duration?: number;
};

export type Toast = {
  id: string;
  tone: ToastTone;
  message: string;
  title?: string;
};

export const DEFAULT_TOAST_DURATION_MS = 5000;

export type ToastStore = {
  getToasts: () => Toast[];
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  subscribe: (listener: () => void) => () => void;
};

let counter = 0;

function createId(): string {
  counter += 1;
  return `toast-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function createToastStore(): ToastStore {
  let toasts: Toast[] = [];
  const listeners = new Set<() => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function emit() {
    for (const listener of listeners) {
      listener();
    }
  }

  function clearTimer(id: string) {
    const timer = timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }

  function dismiss(id: string) {
    const next = toasts.filter((toast) => toast.id !== id);
    if (next.length === toasts.length) {
      return;
    }

    clearTimer(id);
    toasts = next;
    emit();
  }

  function push(input: ToastInput): string {
    const id = createId();
    const toast: Toast = {
      id,
      tone: input.tone,
      message: input.message,
      ...(input.title ? { title: input.title } : {})
    };

    toasts = [...toasts, toast];

    const duration = input.duration ?? DEFAULT_TOAST_DURATION_MS;
    if (duration > 0) {
      timers.set(
        id,
        setTimeout(() => {
          dismiss(id);
        }, duration)
      );
    }

    emit();
    return id;
  }

  return {
    getToasts: () => toasts,
    push,
    dismiss,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
