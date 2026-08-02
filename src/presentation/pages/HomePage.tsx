interface HomePageProps {
  readonly currentDate: string;
}

export function HomePage({ currentDate }: HomePageProps) {
  return (
    <main className="foundation-page">
      <section className="foundation-panel" aria-labelledby="page-title" aria-live="polite">
        <h1 id="page-title">LifeOS</h1>
        <p className="foundation-summary">Локальная система готова</p>
        <p className="startup-guidance">Текущая дата: {currentDate}</p>
        <p className="startup-guidance">Хранилище: IndexedDB подключена</p>
      </section>
    </main>
  );
}
