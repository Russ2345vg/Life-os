import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { DAY_STATUS, DayDate, DECISION_KIND, EntityId } from '../../domain';
import { SystemClock } from '../../infrastructure/clock/SystemClock';
import { SystemCurrentDateProvider } from '../../infrastructure/clock/SystemCurrentDateProvider';
import { CryptoIdGenerator } from '../../infrastructure/ids/CryptoIdGenerator';
import { IndexedDbActionSessionRepository } from '../../infrastructure/persistence/IndexedDbActionSessionRepository';
import { IndexedDbDayRepository } from '../../infrastructure/persistence/IndexedDbDayRepository';
import { IndexedDbDecisionRepository } from '../../infrastructure/persistence/IndexedDbDecisionRepository';
import { IndexedDbLifeActionRepository } from '../../infrastructure/persistence/IndexedDbLifeActionRepository';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { LifeOsApplicationInitializationError } from './LifeOsApplicationInitializationError';
import { createLifeOsApplication } from './createLifeOsApplication';

const TODAY = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-02T08:00:00.000+09:00');

describe('createLifeOsApplication', () => {
  it('открывает базу и собирает постоянные репозитории и системные службы', async () => {
    const application = await createLifeOsApplication({
      database: new LifeOsIndexedDb(new IDBFactory()),
    });

    expect(application.dayRepository).toBeInstanceOf(IndexedDbDayRepository);
    expect(application.decisionRepository).toBeInstanceOf(IndexedDbDecisionRepository);
    expect(application.lifeActionRepository).toBeInstanceOf(IndexedDbLifeActionRepository);
    expect(application.actionSessionRepository).toBeInstanceOf(IndexedDbActionSessionRepository);
    expect(application.clock).toBeInstanceOf(SystemClock);
    expect(application.currentDateProvider).toBeInstanceOf(SystemCurrentDateProvider);
    expect(application.idGenerator).toBeInstanceOf(CryptoIdGenerator);
    expect(application.currentDate).toBeInstanceOf(DayDate);
    await expect(
      application.dayRepository.findByDate(application.currentDateProvider.getCurrentDate()),
    ).resolves.not.toBeNull();

    application.close();
  });

  it('создаёт текущий день один раз и использует его после повторного запуска', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstIds = new FakeIdGenerator('first-start');
    const firstApplication = await createTestApplication(indexedDbFactory, firstIds);
    const firstDay = await firstApplication.dayRepository.findByDate(TODAY);

    expect(firstDay?.status).toBe(DAY_STATUS.open);
    expect(firstIds.generatedCount).toBe(3);
    firstApplication.close();

    const secondIds = new FakeIdGenerator('second-start');
    const secondApplication = await createTestApplication(indexedDbFactory, secondIds);
    const restoredDay = await secondApplication.dayRepository.findByDate(TODAY);

    expect(restoredDay?.id.equals(firstDay!.id)).toBe(true);
    expect(restoredDay?.getUncommittedEvents()).toHaveLength(0);
    expect(secondIds.generatedCount).toBe(0);
    secondApplication.close();
  });

  it('не открывает повторно завершённый сегодняшний день', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('first-start'),
    );
    const completedDay = await firstApplication.dayRepository.findByDate(TODAY);
    completedDay!.complete(NOW, EntityId.create('completed-event'));
    await firstApplication.dayRepository.save(completedDay!);
    firstApplication.close();

    const reloadIds = new FakeIdGenerator('reload');
    const reloadedApplication = await createTestApplication(indexedDbFactory, reloadIds);
    const restoredDay = await reloadedApplication.dayRepository.findByDate(TODAY);

    expect(restoredDay?.status).toBe(DAY_STATUS.completed);
    expect(restoredDay?.getUncommittedEvents()).toHaveLength(0);
    expect(reloadIds.generatedCount).toBe(0);
    reloadedApplication.close();
  });

  it('закрывает подключение через контейнер', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const close = vi.spyOn(database, 'close');
    const application = await createLifeOsApplication({
      database,
      clock: new FakeClock(NOW),
      currentDateProvider: new FakeCurrentDateProvider(TODAY),
      idGenerator: new FakeIdGenerator(),
    });

    application.close();

    expect(close).toHaveBeenCalledOnce();
  });

  it('сохраняет созданное решение между запусками без дубликата', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('persistent'),
    );

    const createResult = await firstApplication.createDecisionForDate.execute({
      title: 'Сохранить решение постоянно',
      kind: DECISION_KIND.main,
      plannedDate: firstApplication.currentDate,
      expectedResult: 'Решение доступно после перезапуска',
    });
    expect(createResult.ok).toBe(true);
    firstApplication.close();

    const secondApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('reload'),
    );
    const restored = await secondApplication.getDecisionsForDate.execute(
      secondApplication.currentDate,
    );

    expect(restored).toHaveLength(1);
    expect(restored[0]?.title.toString()).toBe('Сохранить решение постоянно');
    expect(restored[0]?.order).toBe(1);
    secondApplication.close();
  });

  it('возвращает контролируемую ошибку и закрывает базу при сбое запуска', async () => {
    const database = new LifeOsIndexedDb(null);
    const close = vi.spyOn(database, 'close');

    const startup = createLifeOsApplication({ database });

    await expect(startup).rejects.toBeInstanceOf(LifeOsApplicationInitializationError);
    await expect(startup).rejects.toMatchObject({ code: 'app.initialization_failed' });
    expect(close).toHaveBeenCalledOnce();
  });
});

async function createTestApplication(indexedDbFactory: IDBFactory, idGenerator: FakeIdGenerator) {
  return createLifeOsApplication({
    database: new LifeOsIndexedDb(indexedDbFactory),
    clock: new FakeClock(NOW),
    currentDateProvider: new FakeCurrentDateProvider(TODAY),
    idGenerator,
  });
}
