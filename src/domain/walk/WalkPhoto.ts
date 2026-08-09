export const MAX_WALK_PHOTO_BYTES = 5 * 1024 * 1024;

export interface WalkPhoto {
  readonly dataUrl: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}
