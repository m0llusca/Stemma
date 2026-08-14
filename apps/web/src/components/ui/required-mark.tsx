/**
 * Единый индикатор обязательного поля: видимая звёздочка + доступная подпись.
 * Ставится внутри <label> сразу после текста подписи.
 */
export function RequiredMark() {
  return (
    <span className="ml-0.5 font-bold text-destructive" title="Обязательное поле">
      <span aria-hidden="true">*</span>
      <span className="sr-only">обязательное поле</span>
    </span>
  );
}
