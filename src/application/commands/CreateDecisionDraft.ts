import {
  Decision,
  type DecisionKind,
  type DecisionTitle,
  type EntityId,
  type ExpectedResult,
} from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { ProjectRepository } from '../ports/ProjectRepository';
import { resolveDecisionProject } from './decisionProjectSupport';
import { domainFailure } from './decisionCommandResult';

export interface CreateDecisionDraftInput {
  readonly title: DecisionTitle;
  readonly kind: DecisionKind;
  readonly reason?: string;
  readonly expectedResult?: ExpectedResult;
  readonly sphereId?: EntityId | null;
  readonly projectId?: EntityId | null;
}

export class CreateDecisionDraft {
  readonly #repository: DecisionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #projectRepository: ProjectRepository | null;

  public constructor(
    repository: DecisionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
    projectRepository?: ProjectRepository,
  ) {
    this.#repository = repository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#projectRepository = projectRepository ?? null;
  }

  public async execute(input: CreateDecisionDraftInput): Promise<Result<Decision, DomainError>> {
    try {
      const project = await resolveDecisionProject(
        this.#projectRepository,
        input.projectId ?? null,
        input.sphereId ?? null,
      );
      const decision = Decision.createDraft({
        id: this.#idGenerator.generate(),
        title: input.title,
        kind: input.kind,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        ...(input.expectedResult === undefined ? {} : { expectedResult: input.expectedResult }),
        sphereId: project.sphereId,
        projectId: project.projectId,
        occurredAt: this.#clock.now(),
        eventId: this.#idGenerator.generate(),
      });

      await this.#repository.save(decision);
      return success(decision);
    } catch (error: unknown) {
      return domainFailure(error);
    }
  }
}
