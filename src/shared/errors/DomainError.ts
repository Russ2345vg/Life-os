export class DomainError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DomainError';
    this.code = code;
  }
}
