import { describe, expect, it } from 'vitest';
import { SYNC_ENTITY_TYPES } from '../../../application/sync/SyncRegistry';
import {
  normalizePilotRecord,
  haveSamePilotSemanticContent,
  prepareRemotePilotRecord,
} from './PilotSyncRegistryAdapters';
import { structuredSyncFixtures } from './StructuredSyncFixtures';

describe('SYNC-04 real adapter wire round trips', () => {
  const fixtures = structuredSyncFixtures();
  it.each(SYNC_ENTITY_TYPES)(
    '%s accepts its own attachment-free wire payload on repeated delivery',
    (type) => {
      const local = fixtures[type];
      const wire = normalizePilotRecord(type, local);
      expect(wire.id).toBe(local.id);
      expect(wire).not.toHaveProperty('version');
      expect(wire).not.toHaveProperty('coverImage');
      expect(wire).not.toHaveProperty('photo');
      expect(normalizePilotRecord(type, wire)).toEqual(wire);
      expect(haveSamePilotSemanticContent(type, local, wire)).toBe(true);
      const restored = prepareRemotePilotRecord(type, wire);
      expect(normalizePilotRecord(type, restored)).toEqual(wire);
      expect(() => normalizePilotRecord(type, { ...wire, id: null })).toThrow();
    },
  );
});
