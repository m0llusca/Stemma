"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveAiProviderCredential, type SaveAiProviderCredentialState } from "@/lib/ai-provider-credentials-actions";

const initialState: SaveAiProviderCredentialState = {
  status: "idle"
};

export type AiProviderKeyExtraField = {
  name: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
};

function SaveKeySubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="action-button action-button--primary" disabled={pending}>
      {pending ? "Сохраняем..." : "Сохранить"}
    </button>
  );
}

export function AiProviderKeyForm({
  provider,
  maskedDbKey,
  hasEnvKey,
  extraFields
}: {
  provider: string;
  maskedDbKey: string | null;
  hasEnvKey: boolean;
  extraFields: AiProviderKeyExtraField[];
}) {
  const [state, formAction] = useActionState(saveAiProviderCredential, initialState);

  const keyPlaceholder = maskedDbKey
    ? `Сохранён ${maskedDbKey} — оставьте пустым, чтобы не менять`
    : hasEnvKey
      ? "Задан через переменные окружения — оставьте пустым"
      : "Введите API-ключ";
  const keyHint = maskedDbKey
    ? "Ключ хранится в зашифрованном виде. Оставьте пустым и нажмите «Сохранить», чтобы не менять; введите новый, чтобы заменить, или удалите ниже."
    : hasEnvKey
      ? "Сейчас используется ключ из окружения. Введённый здесь ключ переопределит его для этого пространства."
      : "Хранится в зашифрованном виде в БД и подставляется при обращении к провайдеру.";

  return (
    <form action={formAction} className="messaging-channel-form">
      <input type="hidden" name="provider" value={provider} />

      <label className="messaging-channel-form__field">
        <span className="messaging-channel-form__label">API-ключ</span>
        <input
          name="apiKey"
          type="password"
          defaultValue=""
          placeholder={keyPlaceholder}
          className="form-control"
          autoComplete="off"
        />
        <span className="messaging-channel-form__hint">{keyHint}</span>
      </label>

      {extraFields.map((field) => (
        <label key={field.name} className="messaging-channel-form__field">
          <span className="messaging-channel-form__label">{field.label}</span>
          <input
            name={field.name}
            type="text"
            defaultValue={field.defaultValue}
            placeholder={field.placeholder}
            className="form-control"
            autoComplete="off"
          />
        </label>
      ))}

      {maskedDbKey ? (
        <label className="messaging-channel-form__toggle">
          <input type="checkbox" name="clear" value="1" />
          <span>Удалить сохранённый ключ из БД</span>
        </label>
      ) : null}

      <div className="messaging-channel-form__actions">
        <SaveKeySubmitButton />
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
