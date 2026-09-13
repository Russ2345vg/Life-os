import { DomainError } from '../../shared/errors/DomainError';

export interface CommandDraft {
  readonly type: 'create_task' | 'create_goal' | 'reschedule_task' | 'complete_task' | 'list_tasks';
  readonly title: string;
  readonly date?: string;
  readonly time?: string;
  readonly reason?: string;
  readonly actualResult?: string;
  readonly dateIssue?: string;
  readonly timeIssue?: string;
}
export type ClarificationField =
  'title' | 'date' | 'time' | 'reason' | 'actualResult' | 'omit_time' | 'omit_deadline';

/** Trusted adapter outcome: no executable command, target or confirmation can travel with it. */
export class CommandClarification extends DomainError {
  public readonly confidence = 'needs_input';
  public readonly draft: CommandDraft;
  public constructor(
    draft: CommandDraft,
    public readonly field: ClarificationField,
    message: string,
  ) {
    super('voice_command.clarification', message);
    this.draft = Object.freeze({ ...draft });
  }
}
