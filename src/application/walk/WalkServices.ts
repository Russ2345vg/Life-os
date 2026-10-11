import type { WalkRepository } from '../ports/WalkRepository';
import type { CommittedWalkChanges } from '../ports/CommittedWalkChanges';
import type { WalkCaptureRepository } from '../ports/WalkCaptureRepository';
import type { WalkCommands } from './WalkCommands';
import type { WalkCaptureCommands } from './WalkCaptureCommands';
import type { MemoryPhotoReader } from '../ports/MemoryPhotoReader';
import type { WalkCaptureProcessing } from './WalkCaptureProcessing';
import type { WalkAnalytics } from './WalkAnalytics';
import type { WalkMemoryExport } from './WalkMemoryExport';
import type { WalkPlanning } from './WalkPlanning';
import type { WalkContextResolver } from './WalkContextResolver';
import type { WalkPreferences } from './WalkPreferences';
import type { SunsetWalkSettings } from './SunsetWalkSettings';
import type { WalkScheduleProjection } from './WalkScheduleProjection';
import type { CitySearchGateway } from '../ports/CitySearchGateway';
import type { WalkReminderCoordinator } from './WalkReminderCoordinator';
export interface WalkServices {
  readonly sunset: {
    readonly settings: SunsetWalkSettings;
    readonly schedule: WalkScheduleProjection;
    readonly cities: CitySearchGateway;
    readonly reminders: WalkReminderCoordinator;
  };
  readonly preferences: WalkPreferences;
  readonly context: WalkContextResolver;
  readonly planning: WalkPlanning;
  readonly memoryExport: WalkMemoryExport;
  readonly analytics: WalkAnalytics;
  readonly processing: WalkCaptureProcessing;
  readonly photoReader: MemoryPhotoReader;
  readonly commands: WalkCommands;
  readonly captures: WalkCaptureCommands;
  readonly queries: WalkRepository & Pick<WalkCaptureRepository, 'listCaptures'>;
  readonly changes: CommittedWalkChanges;
}
