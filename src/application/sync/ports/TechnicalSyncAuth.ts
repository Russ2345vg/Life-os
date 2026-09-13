export interface TechnicalSyncIdentity {
  readonly userId: string;
  readonly isAnonymous: true;
}

export interface TechnicalSyncAuth {
  ensureIdentity(): Promise<TechnicalSyncIdentity>;
  replaceIdentity(): Promise<TechnicalSyncIdentity>;
  close(): Promise<void>;
}
