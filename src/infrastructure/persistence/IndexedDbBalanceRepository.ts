import type { BalanceRepository, BalanceState } from '../../application/ports/BalanceRepository';
import type { Clock, CurrentDateProvider } from '../../application';
import type { DirectionIndicator } from '../../domain/balance/DirectionIndicator';
import { LifeOsIndexedDb, LIFE_OS_STORE } from './indexed-db/LifeOsIndexedDb';
import {
  BALANCE_TRANSACTION_STORES,
  readBalanceTransaction,
  refreshBalanceTransaction,
  balanceRequest,
} from './BalanceSnapshotTransaction';
import { DirectionIndicatorRecordMapper } from './BalanceRecordMappers';
export class IndexedDbBalanceRepository implements BalanceRepository {
  constructor(
    readonly database: LifeOsIndexedDb,
    readonly clock: Clock,
    readonly dates: CurrentDateProvider,
  ) {
    database.configureBalanceSnapshots(BALANCE_TRANSACTION_STORES, (tx) =>
      refreshBalanceTransaction(tx, dates.getCurrentDate().toString(), clock.now()),
    );
  }
  async read(): Promise<BalanceState> {
    return this.run('readonly', readBalanceTransaction);
  }
  async changeIndicators<T>(
    work: (state: BalanceState) => { readonly result: T; readonly indicator: DirectionIndicator },
  ): Promise<T> {
    return this.run('readwrite', async (tx) => {
      const { result, indicator } = work(await readBalanceTransaction(tx));
      await balanceRequest(
        tx
          .objectStore(LIFE_OS_STORE.directionIndicators)
          .put(DirectionIndicatorRecordMapper.toRecord(indicator)),
      );
      await this.database.refreshBalanceSnapshots(tx);
      return result;
    });
  }
  async refreshSnapshots(): Promise<void> {
    return this.run('readwrite', (tx) => this.database.refreshBalanceSnapshots(tx));
  }
  private async run<T>(
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    const db = await this.database.open(),
      tx = db.transaction(BALANCE_TRANSACTION_STORES, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.addEventListener('complete', () => resolve());
      tx.addEventListener('abort', () => reject(tx.error ?? new Error('Сохранение отменено.')));
    });
    void done.catch(() => {});
    try {
      const result = await work(tx);
      await done;
      return result;
    } catch (error: unknown) {
      try {
        tx.abort();
      } catch {
        /* settled */
      }
      await done.catch(() => {});
      throw error;
    }
  }
}
