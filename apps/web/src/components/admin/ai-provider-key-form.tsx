"use client";

import { useState } from "react";
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

export type AiProviderModelField = {
  value: string;
  options: string[];
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

function ModelField({ field }: { field: AiProviderModelField }) {
  const isInitiallyCustom = Boolean(field.value) && !field.options.includes(field.value);
  const [choice, setChoice] = useState(isInitiallyCustom ? "__custom__" : field.value);
  const [custom, setCustom] = useState(isInitiallyCustom ? field.value : "");

  return (
    <label className="messaging-channel-form__field">
      <span className="messaging-channel-form__label">Модель</span>
      <select className="form-control" value={choice} onChange={(event) => setChoice(event.target.value)}>
        <option value="">По умолчанию (провайдера)</option>
        {field.options.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
        <option value="__custom__">Другая модель…</option>
      </select>
      {choice === "__custom__" ? (
        <input
          name="model"
          type="text"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder={field.placeholder ?? "Идентификатор модели"}
          className="form-control mt-2"
          autoComplete="off"
          aria-label="Идентификатор модели"
        />
      ) : (
        <input type="hidden" name="model" value={choice} />
      )}
      <span className="messaging-channel-form__hint">
        {choice === "__custom__"
          ? "Введите точный идентификатор модели провайдера."
          : "Пусто — используется модель провайдера по умолчанию."}
      </span>
    </label>
  );
}

export function AiProviderKeyForm({
  provider,
  maskedDbKey,
  hasEnvKey,
  extraFields,
  modelField
}: {
  provider: string;
  maskedDbKey: string | null;
  hasEnvKey: boolean;
  extraFields: AiProviderKeyExtraField[];
  modelField?: AiProviderModelField;
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

      {modelField ? <ModelField field={modelField} /> : null}

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
