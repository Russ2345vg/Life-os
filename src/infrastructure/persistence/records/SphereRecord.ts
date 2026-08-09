export interface SphereRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly description: string | null;
  readonly icon: string | null;
  readonly color: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
