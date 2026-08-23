export interface ProjectRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sphereId: string | null;
  readonly directionId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly desiredResult: string | null;
  readonly status: string;
  readonly isMain: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
