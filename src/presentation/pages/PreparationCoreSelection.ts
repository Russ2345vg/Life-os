import type { PreparationItem } from '../../domain';

export interface PreparationCoreSelectionDraft {
  readonly selectedKeys: readonly string[];
}

const MINIMUM_CORE_SIZE = 3;
const MAXIMUM_CORE_SIZE = 6;

export function createPreparationCoreSelectionDraft(
  items: readonly PreparationItem[],
  savedKeys: readonly string[] | null,
  recommendedKeys: readonly string[],
): PreparationCoreSelectionDraft {
  return draftFromKeys(items, savedKeys ?? recommendedKeys);
}

export function togglePreparationCoreKey(
  draft: PreparationCoreSelectionDraft,
  itemKey: string,
  items: readonly PreparationItem[],
): PreparationCoreSelectionDraft {
  const selectedKeys = orderedActiveKeys(items, draft.selectedKeys);
  const activeKeys = new Set(items.filter((item) => item.active).map((item) => item.key));

  if (!activeKeys.has(itemKey)) return immutableDraft(selectedKeys);
  if (selectedKeys.includes(itemKey)) {
    return immutableDraft(selectedKeys.filter((key) => key !== itemKey));
  }
  if (selectedKeys.length >= MAXIMUM_CORE_SIZE) return immutableDraft(selectedKeys);

  return draftFromKeys(items, [...selectedKeys, itemKey]);
}

export function canConfirmPreparationCore(
  draft: PreparationCoreSelectionDraft,
  items: readonly PreparationItem[],
): boolean {
  if (
    draft.selectedKeys.length < MINIMUM_CORE_SIZE ||
    draft.selectedKeys.length > MAXIMUM_CORE_SIZE ||
    new Set(draft.selectedKeys).size !== draft.selectedKeys.length
  ) {
    return false;
  }
  const activeKeys = new Set(items.filter((item) => item.active).map((item) => item.key));
  return draft.selectedKeys.every((key) => activeKeys.has(key));
}

function draftFromKeys(
  items: readonly PreparationItem[],
  candidateKeys: readonly string[],
): PreparationCoreSelectionDraft {
  return immutableDraft(orderedActiveKeys(items, candidateKeys));
}

function orderedActiveKeys(
  items: readonly PreparationItem[],
  candidateKeys: readonly string[],
): readonly string[] {
  const selected = new Set(candidateKeys);
  const included = new Set<string>();
  return items.flatMap((item) => {
    if (!item.active || !selected.has(item.key) || included.has(item.key)) return [];
    included.add(item.key);
    return [item.key];
  });
}

function immutableDraft(selectedKeys: readonly string[]): PreparationCoreSelectionDraft {
  return Object.freeze({ selectedKeys: Object.freeze([...selectedKeys]) });
}
