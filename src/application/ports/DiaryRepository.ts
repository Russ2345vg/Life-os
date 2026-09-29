import type { DayDate, DiaryEntry, DiaryPeriodKind } from '../../domain';

export interface DiaryRepository {
  findByPeriodKey(periodKey: string): Promise<DiaryEntry | null>;
  listCompleted(
    kind: DiaryPeriodKind,
    start: DayDate,
    end: DayDate,
  ): Promise<readonly DiaryEntry[]>;
  save(entry: DiaryEntry, expectedVersion: number | null): Promise<DiaryEntry>;
}
