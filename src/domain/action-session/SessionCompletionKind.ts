export const SESSION_COMPLETION_KIND = {
  completed: 'completed',
  interrupted: 'interrupted',
} as const;

export type SessionCompletionKind =
  (typeof SESSION_COMPLETION_KIND)[keyof typeof SESSION_COMPLETION_KIND];
