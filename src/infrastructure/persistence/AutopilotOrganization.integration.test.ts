import { expect, it } from 'vitest';
import { EntityId, DayDate, LifeAction, LifeActionTitle } from '../../domain';
import { preferenceAutopilotFixture } from '../../test/helpers/PreferenceAutopilotFixture';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import { IndexedDbAutopilotSettingsStore } from './IndexedDbAutopilotSettingsStore';
it('does not offer an applicable walk when its required preparation is planned in the future', async () => {
  const f = await preferenceAutopilotFixture();
  try {
    const walk = LifeAction.createDraft({
      id: EntityId.create('walk'),
      title: LifeActionTitle.create('Прогулка'),
      plannedDate: f.date,
      createdAt: f.clock.now(),
      eventId: EntityId.create('walk-created'),
      walkPlan: { kind: 'walk', targetMinutes: 60 },
    });
    const preparation = createLifeActionDraft('prepare');
    preparation.setPlan(DayDate.create('2026-10-11'), false);
    await f.actions.save(walk);
    await f.actions.save(preparation);
    const prefs = await f.settings.getPreferences();
    await f.settings.savePreferences(
      {
        ...prefs.value,
        walk: { ...prefs.value.walk, startMinute: 720 },
        actionRules: [{ actionId: 'walk', context: null, prerequisiteIds: ['prepare'] }],
      },
      prefs.version,
    );
    await expect(f.service.preview({ date: f.date, mode: 'rebuild' })).rejects.toThrow(
      'предшественника',
    );
    expect((await f.actions.findById(walk.id))?.scheduledStartMinute).toBeNull();
    expect((await f.actions.findById(preparation.id))?.plannedDate?.toString()).toBe('2026-10-11');
    expect(await f.profile.blocks.findAll()).toEqual([]);
  } finally {
    f.db.close();
  }
});
it('clears a previously scheduled dependent when its prerequisite is in the future', async () => {
  const f = await preferenceAutopilotFixture();
  try {
    const a = createLifeActionDraft('a'),
      b = createLifeActionDraft('b');
    a.setPlan(f.date, false);
    a.setTimePlanning({
      estimateMinutes: 30,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 30,
    });
    b.setPlan(DayDate.create('2026-10-11'), false);
    await f.actions.save(a);
    await f.actions.save(b);
    const prefs = await f.settings.getPreferences();
    await f.settings.savePreferences(
      { ...prefs.value, actionRules: [{ actionId: 'a', context: null, prerequisiteIds: ['b'] }] },
      prefs.version,
    );
    const preview = await f.service.preview({ date: f.date, mode: 'rebuild' });
    expect(preview.proposals).toHaveLength(0);
    expect(preview.deferred.find((item) => item.actionId === 'a')?.reason).toBe('dependency');
    await f.service.apply(preview);
    expect((await f.actions.findById(EntityId.create('a')))?.scheduledStartMinute).toBeNull();
  } finally {
    f.db.close();
  }
});
it('round-trips rules and pinned windows then applies a pin atomically and preserves it in rebuild', async () => {
  const f = await preferenceAutopilotFixture();
  try {
    for (const id of ['a', 'b']) {
      const a = createLifeActionDraft(id);
      a.setPlan(f.date, false);
      await f.actions.save(a);
    }
    const prefs = await f.settings.getPreferences(),
      draft = await f.settings.getDraft(f.date.toString());
    await f.settings.savePreferences(
      {
        ...prefs.value,
        groupSimilar: true,
        actionRules: [{ actionId: 'b', context: 'Дом', prerequisiteIds: ['a'] }],
      },
      prefs.version,
    );
    await f.settings.saveDraft(
      { ...draft.value, pinnedWindows: [{ actionId: 'a', startMinute: 540, durationMinutes: 30 }] },
      draft.version,
    );
    const store = new IndexedDbAutopilotSettingsStore(f.db);
    expect((await store.readPreferences())?.value.actionRules?.[0]?.prerequisiteIds).toEqual(['a']);
    expect((await store.readDraft(f.date.toString()))?.value.pinnedWindows?.[0]?.startMinute).toBe(
      540,
    );
    await f.service.apply(await f.service.preview({ date: f.date, mode: 'rebuild' }));
    const a = await f.actions.findById(EntityId.create('a'));
    expect(a?.scheduledStartMinute).toBe(540);
    expect(a?.estimateMinutes).toBeNull();
    const rebuilt = await f.service.preview({ date: f.date, mode: 'rebuild' });
    expect(rebuilt.locked.find((item) => item.actionId === 'a')?.startMinute).toBe(540);
    const newer = await f.settings.getPreferences();
    await f.settings.savePreferences({ ...newer.value, groupSimilar: false }, newer.version);
    await expect(f.service.apply(rebuilt)).rejects.toThrow('устарел');
  } finally {
    f.db.close();
  }
});
