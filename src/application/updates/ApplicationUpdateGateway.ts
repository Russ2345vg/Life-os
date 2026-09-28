export interface ApplicationUpdate {
  readonly version: string;
  install(onProgress: (percent: number | null) => void): Promise<'installer-opened' | void>;
  close(): Promise<void>;
}

export interface ApplicationUpdateGateway {
  check(): Promise<ApplicationUpdate | null>;
}
