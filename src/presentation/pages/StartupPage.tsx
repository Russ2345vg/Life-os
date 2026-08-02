interface StartupPageProps {
  readonly status: 'loading' | 'error';
}

export function StartupPage({ status }: StartupPageProps) {
  const isLoading = status === 'loading';

  return (
    <main className="foundation-page">
      <section className="foundation-panel" aria-labelledby="page-title" aria-live="polite">
        <h1 id="page-title">LifeOS</h1>
        <p className={isLoading ? 'foundation-summary' : 'foundation-summary startup-error'}>
          {isLoading ? 'Загрузка локальной системы…' : 'Не удалось запустить локальную систему.'}
        </p>
        {!isLoading && (
          <p className="startup-guidance">
            Обновите страницу. Если ошибка повторится, проверьте доступ к локальному хранилищу
            браузера.
          </p>
        )}
      </section>
    </main>
  );
}
