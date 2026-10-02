export interface CommittedWalkChanges {
  subscribe(listener: () => void): () => void;
}
