import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, RoutineBlock, RoutineBlockRecurrence, Walk } from '../../domain';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import { preferenceAutopilotFixture } from '../../test/helpers/PreferenceAutopilotFixture';
import { autopilotOwnedBlockId } from '../../domain/planner/AutopilotSchedule';
import { WalkRecordMapper } from './mappers/WalkRecordMapper';
describe('autopilot review persistence regressions', () => {
  it.each([
    ['2026-10-10T00:02:00Z', '09:03', '09:33', 573],
    ['2026-10-10T00:02:30Z', '09:02', '09:32', 572],
  ] as const)(
    'retains an owned window before the rounded planning start (%s)',
    async (now, startTime, endTime, endMinute) => {
      const f = await preferenceAutopilotFixture();
      try {
        f.clock.setTime(new Date(now));
        const old = RoutineBlock.create({
          id: EntityId.create(autopilotOwnedBlockId(f.date.toString(), 'walk', 0)),
          anchorDate: f.date,
          title: 'Прогулка',
          startTime,
          endTime,
          category: 'rest',
          required: true,
          recurrence: RoutineBlockRecurrence.create('none'),
          assignment: { kind: 'walk' },
          now: f.clock.now(),
        });
        await f.dependencies.unitOfWork.commit({
          routineBlocks: [{ block: old, expectedVersion: null }],
          journalEntries: [],
        });
        const next = createLifeActionDraft('next');
        next.setPlan(f.date, false);
        await f.actions.save(next);
        const preview = await f.service.preview({ date: f.date, mode: 'rebuild' });
        expect(preview.timeline).toContainEqual(
          expect.objectContaining({ sourceId: old.id.toString(), protected: true }),
        );
        expect(preview.proposals[0]?.startMinute).toBeGreaterThanOrEqual(endMinute);
        await f.service.apply(preview);
        expect(await f.profile.blocks.findAll()).toContainEqual(old);
      } finally {
        f.db.close();
      }
    },
  );
  it('opens an editable setup for an unavailable saved wish and rejects preview until corrected', async () => {
    const f = await preferenceAutopilotFixture();
    try {
      const action = createLifeActionDraft('archived-wish');
      action.complete(null, f.clock.now(), EntityId.create('complete-event'));
      action.archive(f.clock.now(), EntityId.create('archive-event'));
      await f.actions.save(action);
      const draft = await f.settings.getDraft(f.date.toString());
      await f.settings.saveDraft(
        {
          ...draft.value,
          wishes: action.title.toString(),
          wishReferences: [{ kind: 'action', id: 'archived-wish' }],
        },
        draft.version,
      );
      const setup = await f.service.getSetup(f.date);
      expect(setup.wishResolution).toMatchObject({
        unavailable: [{ kind: 'action', id: 'archived-wish' }],
      });
      await expect(f.service.preview({ date: f.date, mode: 'fill' })).rejects.toMatchObject({
        code: 'day_autopilot.wish_unavailable',
      });
      await f.settings.saveDraft(
        { ...setup.draft.value, wishes: '', wishReferences: [] },
        setup.draft.version,
      );
      await expect(f.service.preview({ date: f.date, mode: 'fill' })).resolves.toBeDefined();
    } finally {
      f.db.close();
    }
  });
  it.each([false, true])(
    'keeps manual linked windows in rebuild and readback (archived=%s)',
    async (archived) => {
      const f = await preferenceAutopilotFixture();
      try {
        const linked = createLifeActionDraft('linked');
        linked.setPlan(f.date, false);
        linked.setTimePlanning({
          estimateMinutes: 60,
          scheduledStartMinute: 540,
          scheduledDurationMinutes: 60,
        });
        if (archived) {
          linked.complete(null, f.clock.now(), EntityId.create('complete-event'));
          linked.archive(f.clock.now(), EntityId.create('archive-event'));
        }
        await f.actions.save(linked);
        const next = createLifeActionDraft('next');
        next.setPlan(f.date, false);
        await f.actions.save(next);
        const manual = RoutineBlock.create({
          id: EntityId.create('manual'),
          anchorDate: f.date,
          title: 'Ручное окно',
          startTime: '09:00',
          endTime: '10:00',
          category: 'work',
          required: true,
          recurrence: RoutineBlockRecurrence.create('none'),
          assignment: { kind: 'existingAction', actionId: linked.id },
          now: f.clock.now(),
        });
        await f.dependencies.unitOfWork.commit({
          routineBlocks: [{ block: manual, expectedVersion: null }],
          journalEntries: [],
        });
        const before = await f.actions.findById(linked.id);
        const preview = await f.service.preview({ date: f.date, mode: 'rebuild' });
        expect(preview.proposals.some((item) => item.actionId === 'linked')).toBe(false);
        expect(
          preview.proposals.find((item) => item.actionId === 'next')?.startMinute,
        ).toBeGreaterThanOrEqual(600);
        await f.service.apply(preview);
        expect(await f.actions.findById(linked.id)).toEqual(before);
        const schedule = await f.service.readSchedule(f.date, f.date);
        expect(schedule[0]?.blocks).toContainEqual(
          expect.objectContaining({ sourceId: 'manual', startMinute: 540, endMinute: 600 }),
        );
      } finally {
        f.db.close();
      }
    },
  );
  it.each(['replace', 'delete'])(
    'rejects delayed %s of a routine whose original window has started, atomically',
    async (mode) => {
      const f = await preferenceAutopilotFixture();
      try {
        const old = RoutineBlock.create({
          id: EntityId.create(autopilotOwnedBlockId(f.date.toString(), 'walk', 0)),
          anchorDate: f.date,
          title: 'Прогулка',
          startTime: '10:00',
          endTime: '10:30',
          category: 'rest',
          required: true,
          recurrence: RoutineBlockRecurrence.create('none'),
          assignment: { kind: 'walk' },
          now: f.clock.now(),
        });
        await f.dependencies.unitOfWork.commit({
          routineBlocks: [{ block: old, expectedVersion: null }],
          journalEntries: [],
        });
        const prefs = await f.settings.getPreferences();
        await f.settings.savePreferences(
          { ...prefs.value, walk: { enabled: mode === 'replace', startMinute: 660, minutes: 30 } },
          prefs.version,
        );
        const preview = await f.service.preview({ date: f.date, mode: 'rebuild' });
        const before = await f.actions.findAll();
        f.clock.setTime(new Date('2026-10-10T01:05:00Z'));
        await expect(f.service.apply(preview)).rejects.toMatchObject({
          code: 'day_autopilot.stale_preview',
        });
        expect(await f.profile.blocks.findAll()).toEqual([old]);
        expect(await f.actions.findAll()).toEqual(before);
      } finally {
        f.db.close();
      }
    },
  );
  it('plans a separate walk tomorrow while today has an active walk', async () => {
    const f = await preferenceAutopilotFixture();
    try {
      const active = Walk.create({
        id: EntityId.create('active'),
        date: f.date,
        type: 'restorative',
        now: f.clock.now(),
      }).start({ startedAt: f.clock.now(), mode: 'stopwatch' });
      const db = await f.db.open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('walks', 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        tx.objectStore('walks').put(WalkRecordMapper.toRecord(active));
      });
      const prefs = await f.settings.getPreferences();
      await f.settings.savePreferences(
        { ...prefs.value, walk: { enabled: true, startMinute: 840, minutes: 30 } },
        prefs.version,
      );
      const tomorrow = DayDate.create('2026-10-11'),
        draft = await f.settings.getDraft(tomorrow.toString());
      await f.settings.saveDraft(
        { ...draft.value, startMinute: 540, endMinute: 1320 },
        draft.version,
      );
      const preview = await f.service.preview({ date: tomorrow, mode: 'fill' });
      expect(preview.timeline).toContainEqual(
        expect.objectContaining({
          kind: 'walk',
          startMinute: 840,
          endMinute: 870,
          protected: false,
        }),
      );
    } finally {
      f.db.close();
    }
  });
});
