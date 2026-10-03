export function redactAccountError(reason: unknown, secrets: readonly string[]): string {
  const fallback = 'Не удалось выполнить действие. Проверьте данные и повторите.';
  if (
    typeof reason === 'string' &&
    [
      'Windows secure storage decryption failed.',
      'Secure storage metadata is unavailable.',
      'Secure storage read failed.',
      'Secure storage data is invalid.',
      'Device private key is unavailable.',
      'Invalid device private key.',
    ].includes(reason)
  ) {
    return 'Windows не может открыть защищённые данные LifeOS. Локальные записи не удалены. Для восстановления понадобится прежний профиль Windows или сохранённый ключ восстановления.';
  }
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
