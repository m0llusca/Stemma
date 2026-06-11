import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page-shell">
      <div className="panel" style={{ display: "grid", gap: 16, justifyItems: "center", textAlign: "center", maxWidth: 520, margin: "48px auto", padding: 32 }}>
        <p className="page-kicker">Ошибка 404</p>
        <h1 className="page-title">Страница не найдена</h1>
        <p className="page-subtitle" style={{ maxWidth: 420 }}>
          Запрошенная страница не существует или была перемещена. Вернитесь на дашборд и продолжите работу оттуда.
        </p>
        <div className="admin-actions">
          <Link href="/" className="action-button action-button--primary">
            На дашборд
          </Link>
        </div>
      </div>
    </section>
  );
}
