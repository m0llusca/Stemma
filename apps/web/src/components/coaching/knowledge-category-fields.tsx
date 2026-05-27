"use client";

import { useState } from "react";

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
      <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
        Категория
        <select
          name="category"
          required
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value)}
          className="form-control"
        >
          <option value="" disabled>
            Выберите категорию
          </option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
          <option value={newCategoryValue}>+ Добавить новую категорию</option>
        </select>
      </label>
      {isNewCategory ? (
        <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
          Новая категория
          <input name="newCategory" required placeholder="Например: неверная маршрутизация" className="form-control" />
        </label>
      ) : null}
    </>
  );
}
