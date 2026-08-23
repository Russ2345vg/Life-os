import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RECOMMENDATION_APPLICATION_STATUS,
  RECOMMENDATION_APPLICATION_TARGET_TYPE,
  applyRecommendationApplication,
  cloneTomorrowPlan,
  dismissRecommendationApplication,
  pendingRecommendationApplication,
} from '../../application';
import {
  DECISION_KIND,
  DayDate,
  Decision,
  DecisionTitle,
  EntityId,
  ExpectedResult,
  TomorrowPlan,
} from '../../domain';
import { LIFE_OS_DATABASE_NAME, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbTomorrowPlanRepository } from './IndexedDbTomorrowPlanRepository';
import { IndexedDbTomorrowPlanUnitOfWork } from './IndexedDbTomorrowPlanUnitOfWork';
import { IndexedDbDecisionRepository } from './IndexedDbDecisionRepository';
import { IndexedDbRecommendationApplicationRepository } from './IndexedDbRecommendationApplicationRepository';

describe('TomorrowPlan persistence', () => {
  afterEach(async () => {
    await deleteDatabase();
  });

  it('два входа по cycle и target date видят один сохранённый план', async () => {
    const database = new LifeOsIndexedDb(indexedDB);
    const repository = new IndexedDbTomorrowPlanRepository(database);
    const plan = createPlan();
    const first = await repository.createIfAbsent(plan);
    const second = await repository.createIfAbsent(createPlan('plan-other'));

    expect(second.id.equals(first.id)).toBe(true);
    expect((await repository.findByCycleId(plan.cycleId))?.id.equals(first.id)).toBe(true);
    expect((await repository.findByTargetDate(plan.targetDateKey))?.id.equals(first.id)).toBe(true);
    database.close();
  });

  it('откатывает изменение плана, если связанное Решение не сохранилось', async () => {
    const database = new LifeOsIndexedDb(indexedDB);
    const plans = new IndexedDbTomorrowPlanRepository(database);
    const decisions = new IndexedDbDecisionRepository(database);
    const unitOfWork = new IndexedDbTomorrowPlanUnitOfWork(database);
    const stored = await plans.createIfAbsent(createPlan());
    const duplicate = createDecision('duplicate-decision');
    await decisions.save(duplicate);
    const changed = cloneTomorrowPlan(stored);
    changed.setOutcomes('Не должно сохраниться', null, null, new Date('2026-08-14T13:00:00.000Z'));

    await expect(
      unitOfWork.commit({
        plan: changed,
        expectedPlanVersion: stored.version,
        newDecision: duplicate,
      }),
    ).rejects.toMatchObject({ code: 'tomorrow_plan.transaction_failed' });

    expect((await plans.findById(stored.id))?.minimumOutcome).toBeNull();
    database.close();
  });

  it('атомарно сохраняет изменение TomorrowPlan и APPLIED рекомендации', async () => {
    const database = new LifeOsIndexedDb(indexedDB);
    const plans = new IndexedDbTomorrowPlanRepository(database);
    const applications = new IndexedDbRecommendationApplicationRepository(database);
    const unitOfWork = new IndexedDbTomorrowPlanUnitOfWork(database);
    const stored = await plans.createIfAbsent(createPlan());
    const pending = await applications.createIfAbsent(
      pendingRecommendationApplication('recommendation-atomic', NOW),
    );
    const applied = applyRecommendationApplication(
      pending,
      RECOMMENDATION_APPLICATION_TARGET_TYPE.tomorrowPlan,
      stored.id.toString(),
      'Норма главного Решения обновлена.',
      NOW,
    );
    const changed = cloneTomorrowPlan(stored);
    changed.setOutcomes('Минимум', 'Уточнённая норма', null, NOW);

    await unitOfWork.commit({
      plan: changed,
      expectedPlanVersion: stored.version,
      recommendationApplication: {
        application: applied,
        expectedStatus: RECOMMENDATION_APPLICATION_STATUS.pending,
      },
    });

    expect((await plans.findById(stored.id))?.targetOutcome).toBe('Уточнённая норма');
    expect(await applications.findByRecommendationId(pending.recommendationId)).toMatchObject({
      status: RECOMMENDATION_APPLICATION_STATUS.applied,
      resultMessage: 'Норма главного Решения обновлена.',
    });
    database.close();
  });

  it('конкурентно создаёт одну RecommendationApplication и восстанавливает второй вызов', async () => {
    const database = new LifeOsIndexedDb(indexedDB);
    const firstRepository = new IndexedDbRecommendationApplicationRepository(database);
    const secondRepository = new IndexedDbRecommendationApplicationRepository(database);
    const firstCandidate = pendingRecommendationApplication('recommendation-concurrent', NOW);
    const secondCandidate = pendingRecommendationApplication(
      'recommendation-concurrent',
      new Date(NOW.getTime() + 1_000),
    );

    const [first, second] = await Promise.all([
      firstRepository.createIfAbsent(firstCandidate),
      secondRepository.createIfAbsent(secondCandidate),
    ]);

    expect(second.recommendationId).toBe(first.recommendationId);
    expect(await firstRepository.findByRecommendationId(first.recommendationId)).toMatchObject({
      status: RECOMMENDATION_APPLICATION_STATUS.pending,
    });
    database.close();
  });

  it('откатывает и TomorrowPlan, и application status при ошибке общей транзакции', async () => {
    const database = new LifeOsIndexedDb(indexedDB);
    const plans = new IndexedDbTomorrowPlanRepository(database);
    const decisions = new IndexedDbDecisionRepository(database);
    const applications = new IndexedDbRecommendationApplicationRepository(database);
    const unitOfWork = new IndexedDbTomorrowPlanUnitOfWork(database);
    const stored = await plans.createIfAbsent(createPlan());
    const duplicate = createDecision('duplicate-for-recommendation');
    await decisions.save(duplicate);
    const pending = await applications.createIfAbsent(
      pendingRecommendationApplication('recommendation-rollback', NOW),
    );
    const applied = applyRecommendationApplication(
      pending,
      RECOMMENDATION_APPLICATION_TARGET_TYPE.tomorrowPlan,
      stored.id.toString(),
      'Норма главного Решения обновлена.',
      NOW,
    );
    const changed = cloneTomorrowPlan(stored);
    changed.setOutcomes('Не сохранять', 'Не сохранять', null, NOW);

    await expect(
      unitOfWork.commit({
        plan: changed,
        expectedPlanVersion: stored.version,
        newDecision: duplicate,
        recommendationApplication: {
          application: applied,
          expectedStatus: RECOMMENDATION_APPLICATION_STATUS.pending,
        },
      }),
    ).rejects.toMatchObject({ code: 'tomorrow_plan.transaction_failed' });

    expect((await plans.findById(stored.id))?.minimumOutcome).toBeNull();
    expect(await applications.findByRecommendationId(pending.recommendationId)).toMatchObject({
      status: RECOMMENDATION_APPLICATION_STATUS.pending,
    });
    database.close();
  });

  it('восстанавливает RecommendationApplication после нового подключения', async () => {
    const firstDatabase = new LifeOsIndexedDb(indexedDB);
    const firstRepository = new IndexedDbRecommendationApplicationRepository(firstDatabase);
    await firstRepository.createIfAbsent(
      pendingRecommendationApplication('recommendation-recovery', NOW),
    );
    const pendingApplied = await firstRepository.createIfAbsent(
      pendingRecommendationApplication('recommendation-recovery-applied', NOW),
    );
    await firstRepository.saveIfStatusMatches(
      applyRecommendationApplication(
        pendingApplied,
        RECOMMENDATION_APPLICATION_TARGET_TYPE.tomorrowPlan,
        'tomorrow-plan',
        'Применено.',
        NOW,
      ),
      RECOMMENDATION_APPLICATION_STATUS.pending,
    );
    const pendingDismissed = await firstRepository.createIfAbsent(
      pendingRecommendationApplication('recommendation-recovery-dismissed', NOW),
    );
    await firstRepository.saveIfStatusMatches(
      dismissRecommendationApplication(pendingDismissed, NOW),
      RECOMMENDATION_APPLICATION_STATUS.pending,
    );
    firstDatabase.close();

    const secondDatabase = new LifeOsIndexedDb(indexedDB);
    const recovered = await new IndexedDbRecommendationApplicationRepository(
      secondDatabase,
    ).findByRecommendationId('recommendation-recovery');

    expect(recovered).toMatchObject({
      recommendationId: 'recommendation-recovery',
      status: RECOMMENDATION_APPLICATION_STATUS.pending,
    });
    const recoveredResolved = await new IndexedDbRecommendationApplicationRepository(
      secondDatabase,
    ).findByRecommendationIds([
      'recommendation-recovery-applied',
      'recommendation-recovery-dismissed',
    ]);
    expect(recoveredResolved.map((application) => application.status).sort()).toEqual([
      RECOMMENDATION_APPLICATION_STATUS.applied,
      RECOMMENDATION_APPLICATION_STATUS.dismissed,
    ]);
    secondDatabase.close();
  });
});

const NOW = new Date('2026-08-14T13:00:00.000Z');

function createPlan(id = 'plan-1'): TomorrowPlan {
  return TomorrowPlan.create({
    id: EntityId.create(id),
    cycleId: EntityId.create('cycle-1'),
    sourceDayId: EntityId.create('day-source'),
    targetDayId: EntityId.create('day-target'),
    targetDateKey: DayDate.create('2026-08-15'),
    createdAt: new Date('2026-08-14T12:00:00.000Z'),
  });
}

function createDecision(id: string): Decision {
  const now = new Date('2026-08-14T12:00:00.000Z');
  const decision = Decision.createDraft({
    id: EntityId.create(id),
    title: DecisionTitle.create('Решение'),
    kind: DECISION_KIND.main,
    expectedResult: ExpectedResult.create('Результат'),
    occurredAt: now,
    eventId: EntityId.create(`${id}-draft`),
  });
  decision.plan({
    plannedDate: DayDate.create('2026-08-15'),
    kind: DECISION_KIND.main,
    order: 1,
    expectedResult: ExpectedResult.create('Результат'),
    occurredAt: now,
    eventId: EntityId.create(`${id}-planned`),
  });
  return decision;
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LIFE_OS_DATABASE_NAME);
    request.addEventListener('success', () => resolve());
    request.addEventListener('error', () => reject(request.error));
  });
}
