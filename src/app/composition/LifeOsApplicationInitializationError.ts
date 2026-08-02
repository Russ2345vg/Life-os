export class LifeOsApplicationInitializationError extends Error {
  public readonly code = 'app.initialization_failed';

  public constructor(cause: unknown) {
    super('Не удалось запустить локальную систему LifeOS.', { cause });
    this.name = 'LifeOsApplicationInitializationError';
  }
}
