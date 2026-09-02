export interface ExerciseDefinitionRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly measurementType: string;
  readonly source: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  readonly version: number;
}
