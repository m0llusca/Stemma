"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

type ReportDateInputProps = {
  id: string;
  name: string;
  value: string;
};

export function ReportDateInput({ id, name, value }: ReportDateInputProps) {
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  return (
    <Input
      id={id}
      name={name}
      type="date"
      value={inputValue}
      onChange={(event) => setInputValue(event.currentTarget.value)}
    />
  );
}
