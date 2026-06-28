"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CopyButton } from "@/components/copy-button";
import { createApiTokenFromForm, type CreateApiTokenState } from "@/lib/api-token-actions";
import type { ApiScope } from "@/lib/api-auth";

const initialState: CreateApiTokenState = {
  status: "idle"
};

const apiScopeLabels: Record<ApiScope, string> = {
  all: "Все права",
  "conversations:read": "Чтение диалогов",
  "conversations:write": "Импорт диалогов",
  "reviews:read": "Чтение проверок",
  "reviews:write": "Запись проверок",
  "reports:read": "Отчеты",
  "integrations:run": "Запуск интеграций",
  "jobs:read": "Чтение задач",
  "jobs:write": "Управление задачами"
};

function CreateTokenSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="action-button action-button--primary" disabled={pending}>
      {pending ? "Создаем..." : "Создать ключ"}
    </button>
  );
}

export function ApiTokenCreateForm({ scopes }: { scopes: ApiScope[] }) {
  const [state, formAction] = useActionState(createApiTokenFromForm, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status, state.plainToken]);

  return (
    <div className="grid gap-4">
      <form ref={formRef} action={formAction} className="grid gap-3">
        <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
          Название
          <input name="name" required minLength={2} maxLength={120} placeholder="Например, Helpdesk import" className="form-control" />
        </label>

        <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
          Истекает
          <input name="expiresAt" type="date" className="form-control" />
        </label>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-[var(--text-body)]">Права</legend>
          <div className="grid gap-2 md:grid-cols-2">
            {scopes.map((scope) => (
              <label key={scope} className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-body)]">
                <input type="checkbox" name="scopes" value={scope} defaultChecked={scope === "all"} className="mt-1" />
                <span>
                  <span className="block font-semibold">{apiScopeLabels[scope]}</span>
                  <span className="block font-mono text-xs text-[var(--text-muted)]">{scope}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end">
          <CreateTokenSubmitButton />
        </div>
      </form>

      {state.status === "success" && state.plainToken ? (
        <div className="rounded-lg border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-4 text-sm text-[var(--success)]">
          <div className="mb-3 font-semibold">{state.message}</div>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{state.tokenName}</span>
              <CopyButton value={state.plainToken} label="Скопировать новый ключ" />
            </div>
            <code data-testid="created-api-token-secret" className="inline-code-box compact-text">
              {state.plainToken}
            </code>
          </div>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="rounded-lg border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-4 text-sm font-medium text-[var(--danger)]">{state.message}</div>
      ) : null}
    </div>
  );
}
