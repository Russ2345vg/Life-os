import { MAX_GOAL_COVER_IMAGE_BYTES, type GoalCoverImage } from '../../domain';

export interface GoalFileReader {
  readAsDataUrl(file: File): Promise<string>;
}

export async function readGoalCoverImage(
  file: File,
  reader: GoalFileReader,
): Promise<GoalCoverImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Выберите изображение для обложки.');
  }
  if (file.size < 1) throw new Error('Файл изображения пуст.');
  if (file.size > MAX_GOAL_COVER_IMAGE_BYTES) {
    throw new Error(
      `Размер обложки не должен превышать ${MAX_GOAL_COVER_IMAGE_BYTES / 1024 / 1024} МБ.`,
    );
  }

  const dataUrl = await reader.readAsDataUrl(file);
  if (!dataUrl.startsWith(`data:${file.type};base64,`)) {
    throw new Error('Не удалось прочитать выбранное изображение.');
  }
  return { dataUrl, mimeType: file.type, sizeBytes: file.size };
}

export const browserGoalFileReader: GoalFileReader = {
  readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Не удалось прочитать выбранное изображение.'));
      });
      reader.addEventListener('error', () => {
        reject(new Error('Не удалось прочитать выбранное изображение.'));
      });
      reader.readAsDataURL(file);
    });
  },
};
