"use client";

import { useMemo, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { RequiredMark } from "@/components/ui/required-mark";

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
    <div className="sampling-create">
      <form action={action} className="sampling-create__form">
        {rule ? <input type="hidden" name="ruleId" value={rule.id} /> : null}
        <div className="form-group">
          <p className="form-group__label">Сегмент</p>
          <div className="form-group__body">
            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              <span>
                Название
                <RequiredMark />
              </span>
              <input name="name" value={name} onChange={(event) => setName(event.target.value)} required className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              Тип
              <select name="type" value={type} onChange={(event) => setType(event.target.value)} className="form-control">
                {ruleTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="form-group">
          <p className="form-group__label">Условия</p>
          <div className="form-group__body form-group__body--grid">
            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              Канал
              <select name="channel" value={channel} onChange={(event) => setChannel(event.target.value)} className="form-control">
                <option value="">Любой</option>
                {channelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              CSAT
              <select name="csatBucket" value={csatBucket} onChange={(event) => setCsatBucket(event.target.value)} className="form-control">
                <option value="">Любой</option>
                {csatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              Линия
              <input name="supportLine" value={supportLine} onChange={(event) => setSupportLine(event.target.value)} placeholder="1ЛП" className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              Тег
              <input name="tag" value={tag} onChange={(event) => setTag(event.target.value)} placeholder="new_hire" className="form-control" />
            </label>
          </div>
        </div>

        <div className="form-group">
          <p className="form-group__label">Доля</p>
          <div className="form-group__body form-group__body--grid">
            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              Доля, %
              <input
                name="targetPercent"
                type="number"
                min="1"
                max="100"
                value={targetPercent}
                onChange={(event) => setTargetPercent(Number(event.target.value))}
                className="form-control tabular-nums"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              Приоритет
              <input
                name="priority"
                type="number"
                value={priority}
                onChange={(event) => setPriority(Number(event.target.value))}
                className="form-control tabular-nums"
              />
            </label>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm font-medium text-[var(--text-body)]">
            <input name="isActive" type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            Включить сразу
          </label>
        </div>

        <div className="flex justify-end">
          {/* Единый паттерн сабмита (#17): кнопка всегда активна, полевые правила
              закрывает нативный required при отправке. */}
          <button type="submit" className="action-button action-button--primary">
            {rule ? "Сохранить правило" : "Создать правило"}
          </button>
        </div>
      </form>

      <aside className="sampling-plan" aria-live="polite" aria-label="Сводка плана выборки">
        <div className="sampling-plan__head">
          <p className="ops-panel__eyebrow">План выборки</p>
          <Chip tone={isActive ? "success" : "neutral"} size="xs">
            {isActive ? "Активно" : "Выключено"}
          </Chip>
        </div>
        <p className="sampling-plan__name">{name.trim() || "Без названия"}</p>

        <div className="sampling-plan__metric">
          <span className="sampling-plan__metric-label">Доля обращений</span>
          <span className="sampling-plan__metric-value tabular-nums">{clampedPercent}%</span>
          <span className="sampling-plan__metric-hint tabular-nums">≈ {perHundred} из 100 обращений</span>
        </div>

        <dl className="sampling-plan__rows">
          <div className="sampling-plan__row">
            <dt>Тип</dt>
            <dd>{typeLabel}</dd>
          </div>
          <div className="sampling-plan__row">
            <dt>Приоритет</dt>
            <dd className="tabular-nums">{Number.isFinite(priority) ? priority : 0}</dd>
          </div>
        </dl>

        <p className="form-group__label">Условия отбора</p>
        {conditions.length > 0 ? (
          <div className="sampling-plan__conditions">
            {conditions.map((condition) => (
              <Chip key={condition.label} tone="neutral" size="xs" label={condition.label} value={condition.value} />
            ))}
          </div>
        ) : (
          <p className="record-meta">Без условий — правило применится ко всем обращениям выбранного типа.</p>
        )}
      </aside>
    </div>
  );
}
