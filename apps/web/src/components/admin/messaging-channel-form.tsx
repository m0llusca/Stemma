"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveMessagingChannel, setMessagingChannelStatus, type SaveMessagingChannelState } from "@/lib/messaging-actions";
import { statusToneClass } from "@/lib/ui/status-tone";
import { cn } from "@/lib/utils";

const initialState: SaveMessagingChannelState = {
  status: "idle"
};

function SaveChannelSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Сохраняем..." : "Сохранить"}
    </Button>
  );
}

/**
 * Переключатель active/draft. Включение идёт через probe-before-save:
 * webhook probe → probeBeforeSaveGate("activate") → persist only if allowed.
 * claim_live без live cert блокируется. Не претендует на live cert.
 */
export function MessagingChannelStatusToggle({
  kind,
  isActive
}: {
  kind: string;
  isActive: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(setMessagingChannelStatus, initialState);

  return (
    <form ref={formRef} action={formAction} className="grid gap-1">
      <div className="flex items-center gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="status" value={isActive ? "draft" : "active"} />
        <Switch
          checked={isActive}
          size="sm"
          aria-label={isActive ? "Перевести уведомление в черновик" : "Включить уведомление для доставки"}
          onCheckedChange={() => {
            formRef.current?.requestSubmit();
          }}
        />
        <span className="text-sm text-muted-foreground">{isActive ? "Включён" : "Черновик"}</span>
      </div>
      {state.status === "success" && state.message ? (
        <span className={cn("max-w-56 text-xs font-medium", statusToneClass(state.tone ?? "warning"))}>
          {state.message}
        </span>
      ) : null}
      {state.status === "error" && state.message ? <FieldError>{state.message}</FieldError> : null}
    </form>
  );
}

export function MessagingChannelForm({
  kind,
  displayName,
  status,
  maskedWebhook,
  hasSecret
}: {
  kind: string;
  displayName: string;
  status: string;
  maskedWebhook: string | null;
  hasSecret: boolean;
}) {
  const [state, formAction] = useActionState(saveMessagingChannel, initialState);
  const isActive = status === "active";
  const webhookId = `webhook-${kind}`;
  const tokenId = `token-${kind}`;

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="displayName" value={displayName} />

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={webhookId}>Webhook URL</FieldLabel>
          <Input
            id={webhookId}
            name="webhookUrl"
            type="url"
            inputMode="url"
            defaultValue=""
            placeholder={maskedWebhook ?? "https://example.com/webhook"}
            autoComplete="off"
          />
          <FieldDescription>
            {maskedWebhook
              ? `Сохранен адрес ${maskedWebhook}. Заполните поле, чтобы заменить его.`
              : "Адрес, на который Stemma отправит POST-уведомление."}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor={tokenId}>Токен или ключ (необязательно)</FieldLabel>
          <Input
            id={tokenId}
            name="token"
            type="password"
            defaultValue=""
            placeholder={hasSecret ? "Сохранен — оставьте пустым, чтобы не менять" : "Bearer-токен или подпись"}
            autoComplete="off"
          />
          <FieldDescription>
            {hasSecret
              ? "Секрет write-only: хранится зашифрованным и в UI не возвращается. Введите новый, чтобы заменить."
              : "Хранится зашифрованным; после сохранения в UI не отображается."}
          </FieldDescription>
        </Field>
      </FieldGroup>

      {/*
        Единственный контрол включения — MessagingChannelStatusToggle
        в списке уведомлений (setMessagingChannelStatus). Скрытое поле передаёт
        текущий статус, потому что saveMessagingChannel трактует отсутствующий
        status как "draft" и сохранение молча выключило бы доставку.
      */}
      <input type="hidden" name="status" value={isActive ? "active" : "draft"} />

      <div className="flex flex-wrap items-center gap-3">
        <SaveChannelSubmitButton />
        {state.status === "success" ? (
          <span className={cn("text-sm font-medium", statusToneClass(state.tone ?? "warning"))}>
            {state.message}
          </span>
        ) : null}
        {state.status === "error" ? <FieldError>{state.message}</FieldError> : null}
      </div>
    </form>
  );
}
