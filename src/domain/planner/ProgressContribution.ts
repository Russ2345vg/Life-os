import type { PlanningRecord } from './PlanningPeriod';
export interface ContributionLink extends PlanningRecord {
  readonly excludedCompletionKeys?: readonly string[];
  readonly sourceType: 'action' | 'rule';
  readonly sourceId: string;
  readonly goalId: string;
  readonly mode: 'fixed' | 'actual';
  readonly amount: number;
  readonly effectiveFrom: string;
  readonly removed: boolean;
}
export interface ProgressContribution extends PlanningRecord {
  readonly goalId: string;
  readonly actionId: string | null;
  readonly completionKey: string | null;
  readonly linkId: string | null;
  readonly source: 'completion' | 'manual' | 'backfill' | 'initial';
  readonly amount: number | null;
  readonly effectiveDate: string;
  readonly occurredAt: string;
  readonly voided: boolean;
  readonly reason: string;
}
export function contributionId(completionKey: string, linkId: string): string {
  return `contribution:${encodeURIComponent(completionKey)}:${encodeURIComponent(linkId)}`;
}
export function linkId(sourceType: 'action' | 'rule', sourceId: string, goalId: string): string {
  return `link:${sourceType}:${encodeURIComponent(sourceId)}:${encodeURIComponent(goalId)}`;
}
