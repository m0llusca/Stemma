"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  AiProviderKeyForm,
  type AiProviderKeyExtraField,
  type AiProviderModelField
} from "@/components/admin/ai-provider-key-form";
import { saveAiScoringProvider } from "@/lib/ai-scoring-settings-actions";
import { statusSurfaceClass, type StatusTone } from "@/lib/ui/status-tone";
import { cn } from "@/lib/utils";

export type AiProviderConfig = {
  provider: string;
  name: string;
  summary: string;
  statusLabel: string;
  statusTone: StatusTone;
  maskedDbKey: string | null;
  hasEnvKey: boolean;
  extraFields: AiProviderKeyExtraField[];
  modelField?: AiProviderModelField;
};

const ENGINE_OPTIONS = [
  { value: "auto", label: "Авто (первый настроенный)" },
  { value: "yandexgpt", label: "YandexGPT" },
  { value: "anthropic", label: "Claude (Anthropic)" },
  { value: "openai", label: "ChatGPT (OpenAI)" },
  { value: "deterministic", label: "Детерминированный (без сети)" }
];

function EngineSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Сохраняем..." : "Сохранить движок"}
    </Button>
  );
}

export function AiScoringEnginePanel({
  currentEngine,
  providers
}: {
  currentEngine: string;
  providers: AiProviderConfig[];
}) {
  const [selected, setSelected] = useState(currentEngine);
  const provider = providers.find((entry) => entry.provider === selected);

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <p className="text-sm leading-5 text-muted-foreground">
        Выберите движок — ниже откроются его настройки. «Авто» берёт первый настроенный провайдер в порядке YandexGPT → Claude → ChatGPT, иначе детерминированный fallback.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field className="min-w-[14rem]">
          <FieldLabel htmlFor="ai-scoring-engine">Движок оценки</FieldLabel>
          <Select value={selected} onValueChange={(value) => setSelected(value ?? "auto")}>
            <SelectTrigger id="ai-scoring-engine" className="w-full min-w-[14rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENGINE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <form action={saveAiScoringProvider}>
          <input type="hidden" name="provider" value={selected} />
          <EngineSubmitButton />
        </form>
      </div>

      {provider ? (
        <Card size="sm">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <CardTitle>Ключ и модель — {provider.name}</CardTitle>
                <CardDescription>{provider.summary}</CardDescription>
              </div>
              <Badge
                variant={provider.statusTone === "neutral" ? "secondary" : "outline"}
                className={provider.statusTone === "neutral" ? undefined : cn("border-transparent", statusSurfaceClass(provider.statusTone))}
              >
                Ключ: {provider.statusLabel}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <AiProviderKeyForm
              key={provider.provider}
              provider={provider.provider}
              maskedDbKey={provider.maskedDbKey}
              hasEnvKey={provider.hasEnvKey}
              extraFields={provider.extraFields}
              modelField={provider.modelField}
            />
          </CardContent>
        </Card>
      ) : selected === "auto" ? (
        <p className="text-sm text-muted-foreground">
          Режим «Авто» использует первый настроенный провайдер. Чтобы задать ключ конкретного провайдера, выберите его в списке выше.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Детерминированный режим работает офлайн и не требует ключа.</p>
      )}
    </div>
  );
}
