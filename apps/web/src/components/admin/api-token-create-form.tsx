"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CopyButton } from "@/components/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { createApiTokenFromForm, type CreateApiTokenState } from "@/lib/api-token-actions";
import type { ApiScope } from "@/lib/api-auth";
import { statusSurfaceClass } from "@/lib/ui/status-tone";
import { cn } from "@/lib/utils";

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
    <Button type="submit" disabled={pending}>
      {pending ? "Создаем..." : "Создать ключ"}
    </Button>
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
      <form ref={formRef} action={formAction} className="grid gap-4">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="api-token-name">
              Название
              <RequiredMark />
            </FieldLabel>
            <Input
              id="api-token-name"
              name="name"
              required
              minLength={2}
              maxLength={120}
              placeholder="Например, импорт обращений"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="api-token-expires">Истекает</FieldLabel>
            <Input id="api-token-expires" name="expiresAt" type="date" />
          </Field>

          <FieldSet>
            <FieldLegend variant="label">Права</FieldLegend>
            <FieldDescription>Минимально необходимый набор прав для продуктивной среды.</FieldDescription>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {scopes.map((scope) => (
                <FieldLabel
                  key={scope}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 has-data-checked:border-primary/40 has-data-checked:bg-primary/5"
                >
                  <Checkbox
                    name="scopes"
                    value={scope}
                    defaultChecked={scope === "all"}
                    className="mt-1"
                  />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium leading-snug">{apiScopeLabels[scope]}</span>
                    <span className="font-mono text-xs text-muted-foreground">{scope}</span>
                  </span>
                </FieldLabel>
              ))}
            </div>
          </FieldSet>
        </FieldGroup>

        <div className="flex justify-end">
          <CreateTokenSubmitButton />
        </div>
      </form>

      {state.status === "success" && state.plainToken ? (
        <Alert className={cn("border-success/30", statusSurfaceClass("positive"))}>
          <AlertTitle>{state.message}</AlertTitle>
          <AlertDescription>
            <div className="mt-2 grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">{state.tokenName}</span>
                <CopyButton value={state.plainToken} label="Скопировать новый ключ" />
              </div>
              <code
                data-testid="created-api-token-secret"
                className="block break-all rounded-md border border-border bg-muted/50 px-2.5 py-2 font-mono text-xs text-foreground"
              >
                {state.plainToken}
              </code>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
