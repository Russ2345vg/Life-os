export interface ApplicationUpdate {
  readonly version: string;
  install(onProgress: (percent: number | null) => void): Promise<void>;
  close(): Promise<void>;
}

export interface ApplicationUpdateGateway {
  check(): Promise<ApplicationUpdate | null>;
}
