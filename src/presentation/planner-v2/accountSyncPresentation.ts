export function redactAccountError(reason: unknown, secrets: readonly string[]): string {
  const fallback = 'Не удалось выполнить действие. Проверьте данные и повторите.';
  if (
    !(reason instanceof Error) ||
    reason.message.trim().length === 0 ||
    reason.message.length > 280
  ) {
    return fallback;
  }
  if (secrets.some((secret) => secret.length > 0 && reason.message.includes(secret))) {
    return fallback;
  }
  return reason.message;
}
