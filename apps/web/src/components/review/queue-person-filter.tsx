"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput,
  ComboboxItem, ComboboxList, ComboboxTrigger
} from "@/components/ui/combobox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export type QueuePersonOption = { value: string; label: string };

/** Search is transient; only the exact selected value belongs to the queue form. */
export function QueuePersonFilter({ id, name, label, value, options, formId }: {
  id: string;
  name: string;
  label: string;
  value: string;
  options: QueuePersonOption[];
  formId: string;
}) {
  const [selectedValue, setSelectedValue] = useState(value);
  const hiddenInput = useRef<HTMLInputElement>(null);
  const items = value && !options.some((option) => option.value === value)
    ? [...options, { value, label: value }]
    : options;
  const selected = items.find((item) => item.value === selectedValue) ?? null;

  function select(next: QueuePersonOption | null) {
    const nextValue = next?.value ?? "";
    setSelectedValue(nextValue);
    // The owning form lives outside the Sheet portal. Set its sole field before
    // requestSubmit so the navigation reads the new value in the same event.
    if (hiddenInput.current) {
      hiddenInput.current.value = nextValue;
      hiddenInput.current.form?.requestSubmit();
    }
  }

  if (items.length < 8) {
    return (
      <NativeSelect id={id} name={name} form={formId} defaultValue={value} className="w-full">
        <NativeSelectOption value="">Все</NativeSelectOption>
        {items.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
      </NativeSelect>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1" onInput={(event) => event.stopPropagation()} onChange={(event) => event.stopPropagation()}>
      <input ref={hiddenInput} type="hidden" name={name} form={formId} value={selectedValue} />
      <Combobox
        items={items}
        value={selected}
        onValueChange={select}
        isItemEqualToValue={(item, current) => item.value === current.value}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.value}
      >
        <ComboboxInput id={id} aria-label={label} placeholder="Все — поиск по имени" showTrigger={false} className="w-full">
          <ComboboxTrigger render={<Button type="button" variant="ghost" size="icon-xs" />} aria-label={`Показать список: ${label}`} />
        </ComboboxInput>
        <ComboboxContent>
          <ComboboxEmpty>Ничего не найдено</ComboboxEmpty>
          <ComboboxList>
            {(item: QueuePersonOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {selected ? <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => select(null)} aria-label={`Сбросить фильтр «${label}»`}>Все</Button> : null}
    </div>
  );
}
