"use client";

import { useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type KnowledgeCategoryFieldsProps = {
  categories: string[];
  defaultCategory: string;
};

const newCategoryValue = "__new__";

export function KnowledgeCategoryFields({ categories, defaultCategory }: KnowledgeCategoryFieldsProps) {
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory);
  const isNewCategory = selectedCategory === newCategoryValue;

  return (
    <>
      <Field>
        <FieldLabel htmlFor="knowledge-category">Категория</FieldLabel>
        <NativeSelect
          id="knowledge-category"
          name="category"
          required
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value)}
          className="w-full"
        >
          <NativeSelectOption value="" disabled>
            Выберите категорию
          </NativeSelectOption>
          {categories.map((category) => (
            <NativeSelectOption key={category} value={category}>
              {category}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={newCategoryValue}>+ Добавить новую категорию</NativeSelectOption>
        </NativeSelect>
      </Field>
      {isNewCategory ? (
        <Field>
          <FieldLabel htmlFor="knowledge-newCategory">Новая категория</FieldLabel>
          <Input
            id="knowledge-newCategory"
            name="newCategory"
            required
            placeholder="Например: неверная маршрутизация"
          />
        </Field>
      ) : null}
    </>
  );
}
