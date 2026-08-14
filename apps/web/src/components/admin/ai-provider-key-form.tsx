"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { saveAiProviderCredential, type SaveAiProviderCredentialState } from "@/lib/ai-provider-credentials-actions";
import { statusToneClass } from "@/lib/ui/status-tone";

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

const DEFAULT_MODEL = "__default__";
const CUSTOM_MODEL = "__custom__";

function SaveKeySubmitButton({ confirmMessage }: { confirmMessage: string | null }) {
  const { pending } = useFormStatus();
  const label = pending ? "Сохраняем..." : "Сохранить";

  // Деструктивные варианты сабмита (удаление или перезапись сохраненного ключа)
  // требуют подтверждения; обычное сохранение отправляется сразу.
  if (confirmMessage) {
    return (
      <ConfirmSubmitButton className={buttonVariants()} disabled={pending} confirmMessage={confirmMessage}>
        {label}
      </ConfirmSubmitButton>
    );
  }

  return (
    <Button type="submit" disabled={pending}>
      {label}
    </Button>
  );
}

function ModelField({ field, provider }: { field: AiProviderModelField; provider: string }) {
  const isInitiallyCustom = Boolean(field.value) && !field.options.includes(field.value);
  const [choice, setChoice] = useState(isInitiallyCustom ? CUSTOM_MODEL : field.value || DEFAULT_MODEL);
  const [custom, setCustom] = useState(isInitiallyCustom ? field.value : "");

  const modelValue = choice === CUSTOM_MODEL ? custom : choice === DEFAULT_MODEL ? "" : choice;
  const modelSelectId = `ai-model-${provider}`;

  return (
    <FieldGroup className="gap-2">
      <Field>
        <FieldLabel htmlFor={modelSelectId}>Модель</FieldLabel>
        <Select value={choice} onValueChange={(value) => setChoice(value ?? DEFAULT_MODEL)}>
          <SelectTrigger id={modelSelectId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_MODEL}>По умолчанию (провайдера)</SelectItem>
            {field.options.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_MODEL}>Другая модель…</SelectItem>
          </SelectContent>
        </Select>
        {choice === CUSTOM_MODEL ? (
          <Input
            name="model"
            type="text"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder={field.placeholder ?? "Идентификатор модели"}
            autoComplete="off"
            aria-label="Идентификатор модели"
            className="mt-2"
          />
        ) : (
          <input type="hidden" name="model" value={modelValue} />
        )}
        <FieldDescription>
          {choice === CUSTOM_MODEL
            ? "Введите точный идентификатор модели провайдера."
            : "Пусто — используется модель провайдера по умолчанию."}
        </FieldDescription>
      </Field>
    </FieldGroup>
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
  const [clearRequested, setClearRequested] = useState(false);
  const [hasNewKey, setHasNewKey] = useState(false);

  // Подтверждение только для деструктивных сабмитов (#6): удаление сохраненного
  // ключа (чекбокс clear) или его перезапись новым значением.
  const confirmMessage = clearRequested
    ? `Удалить сохраненный ключ провайдера из БД? AI-скоринг через этого провайдера остановится, пока не будет сохранен новый ключ${hasEnvKey ? " (продолжит действовать ключ из переменных окружения)" : ""}.`
    : maskedDbKey && hasNewKey
      ? `Заменить сохраненный ключ ${maskedDbKey}? Прежний ключ будет перезаписан, восстановить его нельзя.`
      : null;

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
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="provider" value={provider} />

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={`ai-key-${provider}`}>API-ключ</FieldLabel>
          <Input
            id={`ai-key-${provider}`}
            name="apiKey"
            type="password"
            defaultValue=""
            placeholder={keyPlaceholder}
            autoComplete="off"
            onChange={(event) => setHasNewKey(event.target.value.trim().length > 0)}
          />
          <FieldDescription>{keyHint}</FieldDescription>
        </Field>

        {extraFields.map((field) => (
          <Field key={field.name}>
            <FieldLabel htmlFor={`ai-extra-${provider}-${field.name}`}>{field.label}</FieldLabel>
            <Input
              id={`ai-extra-${provider}-${field.name}`}
              name={field.name}
              type="text"
              defaultValue={field.defaultValue}
              placeholder={field.placeholder}
              autoComplete="off"
            />
          </Field>
        ))}

        {modelField ? <ModelField field={modelField} provider={provider} /> : null}

        {maskedDbKey ? (
          <Field orientation="horizontal" className="items-center gap-2">
            <Switch
              id={`ai-clear-${provider}`}
              name="clear"
              value="1"
              checked={clearRequested}
              onCheckedChange={setClearRequested}
            />
            <FieldLabel htmlFor={`ai-clear-${provider}`} className="font-normal">Удалить сохранённый ключ из БД</FieldLabel>
          </Field>
        ) : null}
      </FieldGroup>

      <div className="flex flex-wrap items-center gap-3">
        <SaveKeySubmitButton confirmMessage={confirmMessage} />
        {state.status === "success" ? (
          <span className={cn("text-sm", statusToneClass("positive"))}>{state.message}</span>
        ) : null}
        {state.status === "error" ? (
          <span className={cn("text-sm text-destructive")}>{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}
