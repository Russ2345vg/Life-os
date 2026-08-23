export const MAX_GOAL_COVER_IMAGE_BYTES = 5 * 1024 * 1024;

export interface GoalCoverImage {
  readonly dataUrl: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}
