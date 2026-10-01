import { describe, expect, it } from 'vitest';
import { acquirePlannerDialogScrollLock } from './PlannerDialogScrollLock';

describe('planner dialog scroll lock', () => {
  it('keeps the page locked until the last nested dialog releases it', () => {
    const doc = { documentElement: { style: { overflow: 'auto' } } } as unknown as Document;
    const releasePanel = acquirePlannerDialogScrollLock(doc);
    const releaseChild = acquirePlannerDialogScrollLock(doc);
    expect(doc.documentElement.style.overflow).toBe('hidden');
    releaseChild();
    expect(doc.documentElement.style.overflow).toBe('hidden');
    releasePanel();
    releasePanel();
    expect(doc.documentElement.style.overflow).toBe('auto');
  });
});
