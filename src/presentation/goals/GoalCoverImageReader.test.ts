import { describe, expect, it, vi } from 'vitest';
import { MAX_GOAL_COVER_IMAGE_BYTES } from '../../domain';
import { readGoalCoverImage, type GoalFileReader } from './GoalCoverImageReader';

function file(type: string, size: number): File {
  return { type, size } as File;
}

describe('readGoalCoverImage', () => {
  it('returns the existing GoalCoverImage contract for a valid image', async () => {
    const source = file('image/png', 1);
    const reader: GoalFileReader = {
      readAsDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,YQ=='),
    };

    await expect(readGoalCoverImage(source, reader)).resolves.toEqual({
      dataUrl: 'data:image/png;base64,YQ==',
      mimeType: 'image/png',
      sizeBytes: 1,
    });
    expect(reader.readAsDataUrl).toHaveBeenCalledWith(source);
  });

  it('rejects empty, oversized and non-image files before reading', async () => {
    const reader: GoalFileReader = { readAsDataUrl: vi.fn() };

    await expect(
      readGoalCoverImage(file('image/png', MAX_GOAL_COVER_IMAGE_BYTES + 1), reader),
    ).rejects.toThrow('5 МБ');
    await expect(readGoalCoverImage(file('text/plain', 1), reader)).rejects.toThrow('изображение');
    await expect(readGoalCoverImage(file('image/png', 0), reader)).rejects.toThrow('пуст');
    expect(reader.readAsDataUrl).not.toHaveBeenCalled();
  });

  it('rejects reader output that does not match the selected MIME type', async () => {
    await expect(
      readGoalCoverImage(file('image/png', 1), {
        readAsDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,YQ=='),
      }),
    ).rejects.toThrow('прочитать');
  });
});
