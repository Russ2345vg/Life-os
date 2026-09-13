import { DECISION_STATUS, type Decision } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { CommandTarget } from './CommandRegistry';

export function matchesVoiceQuery(title: string, query: string): boolean {
  const normalize = (text: string) =>
    text
      .toLocaleLowerCase('ru-RU')
      .replaceAll('ё', 'е')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  // Small explicit lexical equivalences, not fuzzy similarity or prefix matching.
  const lexeme = (word: string) =>
    /^(?:встреча|встречу|встречи|встрече|встречей)$/u.test(word) ? 'встреча' : word;
  const words = normalize(query).split(' ').filter(Boolean).map(lexeme);
  const candidate = normalize(title).split(' ').map(lexeme);
  return words.length > 0 && words.every((word) => candidate.includes(word));
}

/** Read-only application query over the existing source of truth; no cache or invented IDs. */
export class VoiceTaskResolver {
  public constructor(private readonly repository: DecisionRepository) {}
  public async search(query: string): Promise<readonly Decision[]> {
    if (!this.repository.findAll)
      throw new DomainError(
        'voice_command.search_unavailable',
        'Поиск задач недоступен в текущем хранилище.',
      );
    return (await this.repository.findAll())
      .filter(
        (item) =>
          !item.isDeleted() &&
          !item.isArchived() &&
          matchesVoiceQuery(item.title.toString(), query),
      )
      .sort(
        (a, b) =>
          (a.plannedDate?.toString() ?? '').localeCompare(b.plannedDate?.toString() ?? '') ||
          a.id.toString().localeCompare(b.id.toString()),
      );
  }
  public async resolve(query: string): Promise<readonly CommandTarget[]> {
    return (await this.search(query))
      .filter(
        (item) =>
          item.plannedDate &&
          (item.status === DECISION_STATUS.planned || item.status === DECISION_STATUS.inProgress),
      )
      .map((item) => ({
        id: item.id.toString(),
        title: item.title.toString(),
        date: item.plannedDate!.toString(),
        version: item.version,
      }));
  }
}
