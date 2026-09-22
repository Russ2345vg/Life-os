export interface AccountSession {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly isAnonymous: boolean;
}

export interface AccountAuth {
  current(): Promise<AccountSession | null>;
  ensureAnonymous(): Promise<AccountSession>;
  beginRegistration(email: string): Promise<AccountSession>;
  resendVerification(email: string): Promise<void>;
  verifyEmail(email: string, token: string): Promise<AccountSession>;
  setPassword(password: string): Promise<AccountSession>;
  signIn(email: string, password: string): Promise<AccountSession>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<AccountSession>;
  signOutCurrent(): Promise<void>;
  close(): Promise<void>;
}
