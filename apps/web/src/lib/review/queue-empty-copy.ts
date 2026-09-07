export const QUEUE_EMPTY_RESET_FILTERS_LABEL = "Сбросить фильтры";
export const QUEUE_EMPTY_TAKE_UNFILTERED_LABEL = "Взять без фильтра";

export const QUEUE_EMPTY_BANNER_GLOBAL = "Свободных обращений в очереди нет.";
export const QUEUE_EMPTY_BANNER_FILTERED = "В текущем представлении свободных кейсов нет.";

export const QUEUE_TABLE_EMPTY_GLOBAL_TITLE = "Очередь пуста";
export const QUEUE_TABLE_EMPTY_GLOBAL_DESCRIPTION =
  "Новые диалоги появятся после импорта, API-загрузки или изменения фильтров отбора.";

export const QUEUE_TABLE_EMPTY_FILTERED_TITLE = "В текущем представлении нет кейсов";
export const QUEUE_TABLE_EMPTY_FILTERED_DESCRIPTION =
  "По выбранным фильтрам свободных обращений нет. Сбросьте фильтры, чтобы увидеть остальные кейсы рабочей области.";

export function queueEmptyBannerMessage(hasActiveFilters: boolean): string {
  return hasActiveFilters ? QUEUE_EMPTY_BANNER_FILTERED : QUEUE_EMPTY_BANNER_GLOBAL;
}

export function queueTableEmptyCopy(hasActiveFilters: boolean): { title: string; description: string } {
  if (hasActiveFilters) {
    return {
      title: QUEUE_TABLE_EMPTY_FILTERED_TITLE,
      description: QUEUE_TABLE_EMPTY_FILTERED_DESCRIPTION
    };
  }

  return {
    title: QUEUE_TABLE_EMPTY_GLOBAL_TITLE,
    description: QUEUE_TABLE_EMPTY_GLOBAL_DESCRIPTION
  };
}
