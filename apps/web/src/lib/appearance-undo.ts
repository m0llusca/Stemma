/**
 * Логика кнопки «Отменить последнее изменение» в настройках оформления (#19).
 * Чистая функция, вынесенная из appearance-settings-form.tsx для тестируемости.
 *
 * Правило отката (минимальное, согласовано с автосейвом формы):
 * 1) есть несохраненные правки (current != lastPersisted) — откатываем к
 *    последнему сохраненному состоянию;
 * 2) правок нет, но известен предыдущий сохраненный шаг — откатываем к нему
 *    (повторное сохранение выполнит обычный автосейв формы);
 * 3) откатывать нечего — возвращаем null (кнопка неактивна).
 */
export function resolveUndoTarget<State>(
  current: State,
  lastPersisted: State,
  previousPersisted: State | null,
  equals: (left: State, right: State) => boolean
): State | null {
  if (!equals(current, lastPersisted)) {
    return lastPersisted;
  }

  if (previousPersisted !== null && !equals(previousPersisted, lastPersisted)) {
    return previousPersisted;
  }

  return null;
}
