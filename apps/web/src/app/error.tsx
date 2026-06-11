"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="page-shell">
      <div className="panel" style={{ display: "grid", gap: 16, justifyItems: "center", textAlign: "center", maxWidth: 520, margin: "48px auto", padding: 32 }}>
        <p className="page-kicker">Ошибка</p>
        <h1 className="page-title">Что-то пошло не так</h1>
        <p className="page-subtitle" style={{ maxWidth: 420 }}>
          Не удалось загрузить раздел. Попробуйте повторить действие. Если ошибка повторяется, обновите страницу или вернитесь позже.
        </p>
        <div className="admin-actions">
          <button type="button" onClick={() => reset()} className="action-button action-button--primary">
            Попробовать снова
          </button>
        </div>
        {error.digest ? (
          <p className="record-meta compact-text" style={{ color: "var(--muted)" }}>
            Код ошибки: {error.digest}
          </p>
        ) : null}
      </div>
    </section>
  );
}
