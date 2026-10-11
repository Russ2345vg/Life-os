import type { SleepObservationService } from '../../../application/sleep/SleepObservationService';
import type { SleepObservation } from '../../../domain/sleep/SleepObservation';
import { cycleDateFromWakeDate, localWakeDate, shiftDate } from './sleepObservationDateModel';

export async function loadSleepObservationHistory(
  service: Pick<SleepObservationService, 'history'>,
  now: Date,
  timeZone: string,
  selectedWakeDate: string | null = null,
): Promise<readonly SleepObservation[]> {
  const today = localWakeDate(now, timeZone);
  const recentFrom = shiftDate(today, -30);
  const selected = cycleDateFromWakeDate(selectedWakeDate ?? today);
  const selectedFrom = shiftDate(selected, -29);
  const windows = [service.history(recentFrom, today)];
  if (selectedFrom < recentFrom) windows.push(service.history(selectedFrom, selected));
  const loaded = (await Promise.all(windows)).flat();
  return [...new Map(loaded.map((item) => [item.cycleDate, item])).values()].sort((a, b) =>
    b.cycleDate.localeCompare(a.cycleDate),
  );
}
