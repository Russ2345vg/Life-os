import type { Project } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { ProjectRepository } from '../ports/ProjectRepository';
import {
  projectFailure,
  projectVersionConflict,
  type ProjectCommandInput,
} from './projectCommandSupport';

export type MakeProjectMainInput = ProjectCommandInput;

export class MakeProjectMain {
  public constructor(
    readonly repository: ProjectRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: MakeProjectMainInput): Promise<Result<Project, DomainError>> {
    const stored = await this.repository.findById(input.id);
    if (stored === null) {
      return failure(new DomainError('project.not_found', 'Проект не найден.'));
    }
    if (stored.version !== input.expectedVersion) return projectVersionConflict();
    try {
      const now = this.clock.now();
      const main = stored.makeMain(now);
      return (await this.repository.replaceMain(main, input.expectedVersion, now))
        ? success(main)
        : projectVersionConflict();
    } catch (error: unknown) {
      return projectFailure(error);
    }
  }
}
