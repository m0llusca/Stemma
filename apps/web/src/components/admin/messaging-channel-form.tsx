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
 * Переключатель active/draft: тот же server action, что и раньше у кнопки
 * «Активировать» / «В черновик». После submit страница revalidate'ится и
 * checked обновится с сервера.
 */
export function MessagingChannelStatusToggle({
  kind,
  isActive
}: {
  kind: string;
  isActive: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={setMessagingChannelStatus} className="flex items-center gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="status" value={isActive ? "draft" : "active"} />
      <Switch
        checked={isActive}
        size="sm"
        aria-label={isActive ? "Перевести канал в черновик" : "Активировать канал"}
        onCheckedChange={() => {
          formRef.current?.requestSubmit();
        }}
      />
      <span className="text-sm text-muted-foreground">{isActive ? "Активен" : "Черновик"}</span>
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
        Единственный контрол активации канала — MessagingChannelStatusToggle
        в списке каналов (setMessagingChannelStatus). Скрытое поле передает
        текущий статус, потому что saveMessagingChannel трактует отсутствующий
        status как "draft" и сохранение молча деактивировало бы канал.
      */}
      <input type="hidden" name="status" value={isActive ? "active" : "draft"} />

      <div className="flex flex-wrap items-center gap-3">
        <SaveChannelSubmitButton />
        {state.status === "success" ? (
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{state.message}</span>
        ) : null}
        {state.status === "error" ? <FieldError>{state.message}</FieldError> : null}
      </div>
    </form>
  );
}
