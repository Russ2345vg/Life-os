export type VoiceDestination =
  | 'today'
  | 'goals'
  | 'journal'
  | 'projects'
  | 'routine'
  | 'walks'
  | 'management'
  | 'spheres'
  | 'analytics'
  | 'settings'
  | 'tasks';

export type VoiceCommand =
  | {
      readonly type: 'create_task';
      readonly payload: { readonly title: string; readonly date: string; readonly time?: string };
    }
  | {
      readonly type: 'create_goal';
      readonly payload: { readonly title: string; readonly deadline?: string };
    }
  | { readonly type: 'create_note'; readonly payload: { readonly content: string } }
  | {
      readonly type: 'create_journal_entry';
      readonly payload: { readonly content: string; readonly date: string };
    }
  | {
      readonly type: 'search';
      readonly payload: { readonly scope: 'goals' | 'tasks'; readonly query: string };
    }
  | { readonly type: 'list_tasks'; readonly payload: { readonly date: string } }
  | { readonly type: 'list_goals'; readonly payload: { readonly status: 'active' } }
  | {
      readonly type: 'complete_task';
      readonly payload: { readonly query: string; readonly actualResult: string };
    }
  | {
      readonly type: 'reschedule_task';
      readonly payload: {
        readonly query: string;
        readonly date: string;
        readonly reason: string;
        readonly time?: string;
      };
    }
  | { readonly type: 'navigate'; readonly payload: { readonly destination: VoiceDestination } };

export type VoiceCommandType = VoiceCommand['type'];

export function requiresConfirmation(command: VoiceCommand): boolean {
  return !['search', 'navigate', 'list_tasks', 'list_goals'].includes(command.type);
}
