import type { SpeechRecognitionFailure } from '../../application/ports/SpeechRecognitionProvider';

export const voiceFailureMessages: Record<SpeechRecognitionFailure, string> = {
  'permission-denied':
    'Доступ к микрофону запрещён. Разрешите его в настройках браузера или устройства.',
  'microphone-unavailable': 'Микрофон недоступен. Проверьте подключение и настройки устройства.',
  'no-speech': 'Речь не распознана. Попробуйте ещё раз или введите текст вручную.',
  network: 'Нет связи со службой распознавания. Проверьте подключение и повторите.',
  'service-unavailable': 'Распознавание недоступно. Попробуйте ещё раз или введите текст вручную.',
  aborted: 'Запись прервана. Нажмите микрофон, чтобы попробовать ещё раз.',
  unknown: 'Не удалось распознать речь. Попробуйте ещё раз или введите текст вручную.',
};
