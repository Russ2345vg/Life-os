import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createLifeOsApplication } from '../../app/composition/createLifeOsApplication';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
describe('walk memory export', () => {
  it('includes saved reflection outcomes in a memory draft', async () => {
    const app = await createLifeOsApplication({ database: new LifeOsIndexedDb(new IDBFactory()) });
    try {
      const service = app.walks!;
      const running = await service.commands.start({
        requestId: 'reflect',
        intent: 'reflection',
        type: 'reflection',
        mode: 'stopwatch',
        question: 'Что дальше?',
        targetMinutes: null,
        sphereId: null,
        beforeState: null,
      });
      const done = await service.commands.complete({
        walkId: running.id.toString(),
        expectedVersion: running.version,
        requestId: 'done',
      });
      const noted = await service.commands.saveReflection({
        walkId: done.id.toString(),
        expectedVersion: done.version,
        requestId: 'notes',
        reflection: { notes: { understood: 'Нужен отдых', open: null, next: 'Назначить встречу' } },
      });
      const result = await service.memoryExport.prepare({
        walkId: noted.id.toString(),
        expectedVersion: noted.version,
        requestId: 'export-notes',
      });
      expect(result.kind).toBe('draft');
      if (result.kind === 'draft') {
        expect(result.draft.body).toContain('Что понял: Нужен отдых');
        expect(result.draft.body).toContain('Что хочу сделать: Назначить встречу');
      }
    } finally {
      app.close();
    }
  });
  it('only prepares a draft, keeps its identity across retries and preserves saved edits', async () => {
    const app = await createLifeOsApplication({ database: new LifeOsIndexedDb(new IDBFactory()) });
    try {
      const service = app.walks!;
      const running = await service.commands.start({
        requestId: 'start',
        intent: 'free',
        type: 'restorative',
        mode: 'stopwatch',
        question: null,
        targetMinutes: null,
        sphereId: null,
        beforeState: null,
      });
      const done = await service.commands.complete({
        walkId: running.id.toString(),
        expectedVersion: running.version,
        requestId: 'finish',
      });
      const input = {
        walkId: done.id.toString(),
        expectedVersion: done.version,
        requestId: 'memory',
      };
      const first = await service.memoryExport.prepare(input);
      const retry = await service.memoryExport.prepare(input);
      expect(first.kind).toBe('draft');
      expect(retry.kind).toBe('draft');
      if (first.kind !== 'draft' || retry.kind !== 'draft') throw new Error('Expected drafts');
      expect(first.draft.id.toString()).toBe(retry.draft.id.toString());
      expect(await app.memory!.queries.get(first.draft.id)).toBeNull();
      await app.memory!.commands.save(
        { ...first.draft, title: 'Моё воспоминание', body: 'Мой текст' },
        null,
      );
      const existing = await service.memoryExport.prepare(input);
      expect(existing.kind).toBe('existing');
      if (existing.kind === 'existing') expect(existing.event.body).toBe('Мой текст');
      await service.commands.saveReflection({
        walkId: done.id.toString(),
        expectedVersion: done.version,
        requestId: 'later-edit',
        reflection: { result: 'Поздний итог' },
      });
      const afterEdit = await service.memoryExport.prepare(input);
      expect(afterEdit.kind).toBe('existing');
      if (afterEdit.kind === 'existing') expect(afterEdit.event.body).toBe('Мой текст');
    } finally {
      app.close();
    }
  });
});
