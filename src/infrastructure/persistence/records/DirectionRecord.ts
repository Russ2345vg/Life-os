export interface DirectionRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sphereId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly strategicIntent?: string | null;
  readonly desiredState?: string | null;
  readonly inScope?: string | null;
  readonly outOfScope?: string | null;
  readonly status: string;
  readonly isMain?: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
