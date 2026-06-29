"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveMessagingChannel, type SaveMessagingChannelState } from "@/lib/messaging-actions";

const initialState: SaveMessagingChannelState = {
  status: "idle"
};

function SaveChannelSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="action-button action-button--primary" disabled={pending}>
      {pending ? "Сохраняем..." : "Сохранить"}
    </button>
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

  return (
    <form action={formAction} className="messaging-channel-form">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="displayName" value={displayName} />

      <label className="messaging-channel-form__field">
        <span className="messaging-channel-form__label">Webhook URL</span>
        <input
          name="webhookUrl"
          type="url"
          inputMode="url"
          defaultValue=""
          placeholder={maskedWebhook ?? "https://example.com/webhook"}
          className="form-control"
          autoComplete="off"
        />
        <span className="messaging-channel-form__hint">
          {maskedWebhook
            ? `Сохранен адрес ${maskedWebhook}. Заполните поле, чтобы заменить его.`
            : "Адрес, на который Stemma отправит POST-уведомление."}
        </span>
      </label>

      <label className="messaging-channel-form__field">
        <span className="messaging-channel-form__label">Токен или ключ (необязательно)</span>
        <input
          name="token"
          type="password"
          defaultValue=""
          placeholder={hasSecret ? "Сохранен — оставьте пустым, чтобы не менять" : "Bearer-токен или подпись"}
          className="form-control"
          autoComplete="off"
        />
        <span className="messaging-channel-form__hint">
          {hasSecret
            ? "Секрет хранится в зашифрованном виде. Введите новый, чтобы заменить."
            : "Хранится в зашифрованном виде и подставляется при отправке."}
        </span>
      </label>

      <label className="messaging-channel-form__toggle">
        <input type="checkbox" name="status" value="active" defaultChecked={isActive} />
        <span>Активировать канал (готов к доставке)</span>
      </label>

      <div className="messaging-channel-form__actions">
        <SaveChannelSubmitButton />
        {state.status === "success" ? (
          <span className="messaging-channel-form__status messaging-channel-form__status--ok">{state.message}</span>
        ) : null}
        {state.status === "error" ? (
          <span className="messaging-channel-form__status messaging-channel-form__status--error">{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}
