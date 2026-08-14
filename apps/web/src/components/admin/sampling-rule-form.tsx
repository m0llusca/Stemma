"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { statusSurfaceClass } from "@/lib/ui/status-tone";

type Option = { value: string; label: string };

/** Начальные значения для режима редактирования существующего правила. */
type SamplingRuleInitial = {
  id: string;
  name: string;
  type: string;
  channel?: string;
  csatBucket?: string;
  supportLine?: string;
  tag?: string;
  targetPercent: number;
  priority: number;
  isActive: boolean;
};

type SamplingRuleFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  channelOptions: Option[];
  csatOptions: Option[];
  ruleTypeOptions: Option[];
  /**
   * Режим редактирования: предзаполняет все поля и отправляет форму с hidden
   * ruleId (страница передаёт action={updateSamplingRule}). Без rule — режим
   * создания, поведение прежнее.
   */
  rule?: SamplingRuleInitial;
};

const ANY_VALUE = "__any__";

function toSelectValue(value: string) {
  return value || ANY_VALUE;
}

function fromSelectValue(value: string | null) {
  if (!value || value === ANY_VALUE) {
    return "";
  }
  return value;
}

export function SamplingRuleForm({ action, channelOptions, csatOptions, ruleTypeOptions, rule }: SamplingRuleFormProps) {
  const [name, setName] = useState(rule?.name ?? "");
  const [type, setType] = useState(rule?.type ?? ruleTypeOptions[0]?.value ?? "random");
  const [channel, setChannel] = useState(rule?.channel ?? "");
  const [csatBucket, setCsatBucket] = useState(rule?.csatBucket ?? "");
  const [supportLine, setSupportLine] = useState(rule?.supportLine ?? "");
  const [tag, setTag] = useState(rule?.tag ?? "");
  const [targetPercent, setTargetPercent] = useState(rule?.targetPercent ?? 10);
  const [priority, setPriority] = useState(rule?.priority ?? 100);
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);

  const conditions = useMemo(() => {
    const parts: Array<{ label: string; value: string }> = [];
    if (channel) parts.push({ label: "Канал", value: channelOptions.find((option) => option.value === channel)?.label ?? channel });
    if (csatBucket) parts.push({ label: "CSAT", value: csatOptions.find((option) => option.value === csatBucket)?.label ?? csatBucket });
    if (supportLine.trim()) parts.push({ label: "Линия", value: supportLine.trim() });
    if (tag.trim()) parts.push({ label: "Тег", value: tag.trim() });
    return parts;
  }, [channel, channelOptions, csatBucket, csatOptions, supportLine, tag]);

  const typeLabel = ruleTypeOptions.find((option) => option.value === type)?.label ?? type;
  const clampedPercent = Math.min(100, Math.max(0, Number.isFinite(targetPercent) ? targetPercent : 0));
  const perHundred = Math.round((clampedPercent / 100) * 100);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_min(280px,100%)]">
      <form action={action} className="flex flex-col gap-4">
        {rule ? <input type="hidden" name="ruleId" value={rule.id} /> : null}
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name="csatBucket" value={csatBucket} />
        {/* Зеркалим checkbox-контракт "on" для server action. */}
        {isActive ? <input type="hidden" name="isActive" value="on" /> : null}

        <FieldSet className="gap-3">
          <FieldLegend variant="label">Сегмент</FieldLegend>
          <FieldGroup className="gap-3 sm:grid sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="sampling-rule-name">
                Название
                <RequiredMark />
              </FieldLabel>
              <Input
                id="sampling-rule-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sampling-rule-type">Тип</FieldLabel>
              <Select value={type} onValueChange={(value) => setType(value ?? ruleTypeOptions[0]?.value ?? "random")}>
                <SelectTrigger id="sampling-rule-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ruleTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet className="gap-3">
          <FieldLegend variant="label">Условия</FieldLegend>
          <FieldGroup className="gap-3 sm:grid sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="sampling-rule-channel">Канал</FieldLabel>
              <Select value={toSelectValue(channel)} onValueChange={(value) => setChannel(fromSelectValue(value))}>
                <SelectTrigger id="sampling-rule-channel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_VALUE}>Любой</SelectItem>
                  {channelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="sampling-rule-csat">CSAT</FieldLabel>
              <Select value={toSelectValue(csatBucket)} onValueChange={(value) => setCsatBucket(fromSelectValue(value))}>
                <SelectTrigger id="sampling-rule-csat" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_VALUE}>Любой</SelectItem>
                  {csatOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="sampling-rule-line">Линия</FieldLabel>
              <Input
                id="sampling-rule-line"
                name="supportLine"
                value={supportLine}
                onChange={(event) => setSupportLine(event.target.value)}
                placeholder="1ЛП"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sampling-rule-tag">Тег</FieldLabel>
              <Input
                id="sampling-rule-tag"
                name="tag"
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                placeholder="new_hire"
              />
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet className="gap-3">
          <FieldLegend variant="label">Доля</FieldLegend>
          <FieldGroup className="gap-3 sm:grid sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="sampling-rule-percent">Доля, %</FieldLabel>
              <Input
                id="sampling-rule-percent"
                name="targetPercent"
                type="number"
                min={1}
                max={100}
                value={targetPercent}
                onChange={(event) => setTargetPercent(Number(event.target.value))}
                className="tabular-nums"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sampling-rule-priority">Приоритет</FieldLabel>
              <Input
                id="sampling-rule-priority"
                name="priority"
                type="number"
                value={priority}
                onChange={(event) => setPriority(Number(event.target.value))}
                className="tabular-nums"
              />
            </Field>
          </FieldGroup>
          <Field orientation="horizontal" className="w-auto items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Включить сразу" />
            <FieldLabel className="font-normal">Включить сразу</FieldLabel>
          </Field>
        </FieldSet>

        <div className="flex justify-end">
          {/* Единый паттерн сабмита (#17): кнопка всегда активна, полевые правила
              закрывает нативный required при отправке. */}
          <Button type="submit">{rule ? "Сохранить правило" : "Создать правило"}</Button>
        </div>
      </form>

      <Card size="sm" aria-live="polite" aria-label="Сводка плана выборки">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-2">
            <CardDescription className="text-xs font-medium uppercase tracking-wide">План выборки</CardDescription>
            <Badge
              variant={isActive ? "outline" : "secondary"}
              className={isActive ? `border-transparent ${statusSurfaceClass("positive")}` : undefined}
            >
              {isActive ? "Активно" : "Выключено"}
            </Badge>
          </div>
          <CardTitle className="text-base">{name.trim() || "Без названия"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Доля обращений</span>
            <span className="text-2xl font-semibold tabular-nums tracking-tight">{clampedPercent}%</span>
            <span className="text-xs tabular-nums text-muted-foreground">≈ {perHundred} из 100 обращений</span>
          </div>

          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Тип</dt>
              <dd>{typeLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Приоритет</dt>
              <dd className="tabular-nums">{Number.isFinite(priority) ? priority : 0}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Условия отбора</p>
            {conditions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {conditions.map((condition) => (
                  <Badge key={condition.label} variant="secondary">
                    {condition.label}: {condition.value}
                  </Badge>
                ))}
              </div>
            ) : (
              <FieldDescription>Без условий — правило применится ко всем обращениям выбранного типа.</FieldDescription>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
