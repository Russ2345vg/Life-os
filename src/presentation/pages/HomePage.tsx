export function HomePage() {
  return (
    <main className="foundation-page">
      <section className="foundation-panel" aria-labelledby="page-title">
        <p className="foundation-eyebrow">Техническое основание</p>
        <h1 id="page-title">LifeOS</h1>
        <p className="foundation-summary">
          Самостоятельная система управления решениями, действиями и результатами.
        </p>
        <div className="foundation-status" aria-label="Текущий этап проекта">
          <span>Текущий этап</span>
          <strong>Предметная модель сессий</strong>
        </div>
      </section>
    </main>
  );
}
