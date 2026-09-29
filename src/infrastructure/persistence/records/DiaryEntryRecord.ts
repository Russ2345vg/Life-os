import type {
  DiaryDayPayload,
  DiaryEntryStatus,
  DiaryMonthPayload,
  DiaryPeriodKind,
  DiaryWeekPayload,
} from '../../../domain';

export interface DiaryEntryRecord {
  readonly id: string;
  readonly periodKey: string;
  readonly kind: DiaryPeriodKind;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: DiaryEntryStatus;
  readonly promptVersion: 1;
  readonly payload: DiaryDayPayload | DiaryWeekPayload | DiaryMonthPayload;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
