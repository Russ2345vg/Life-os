interface StartupPageProps {
  readonly status: 'loading' | 'error';
}

export function StartupPage({ status }: StartupPageProps) {
  const isLoading = status === 'loading';

  return (
    <main className="foundation-page">
      <section className="foundation-panel" aria-labelledby="page-title" aria-live="polite">
        <h1 id="page-title">{isLoading ? 'LifeOS' : 'LifeOS не удалось запустить'}</h1>
        <p className={isLoading ? 'foundation-summary' : 'foundation-summary startup-error'}>
          {isLoading ? 'Загрузка локальной системы…' : 'Локальное хранилище недоступно'}
        </p>
      </section>
    </main>
  );
}
