export interface PreparationRuleRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly condition: string;
  readonly conditionValue: string | null;
  readonly category: string;
  readonly title: string;
  readonly required: boolean;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
