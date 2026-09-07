/**
 * One Take-next verb family across pulse, queue page, ⌘K, preview, and
 * empty-triage. Surfaces that assign+open must use this label — never a
 * sibling like «Взять кейс» / «Взять следующий кейс» / «Открыть приоритетный кейс».
 */
export const TAKE_NEXT_LABEL = "Взять следующий";

/** Search aliases so older «кейс» wording still finds the same action. */
export const TAKE_NEXT_ALIASES = [
  "взять следующий",
  "следующий кейс",
  "взять кейс",
  "начать проверку",
  "next case",
  "next review",
  "проверить"
] as const;
