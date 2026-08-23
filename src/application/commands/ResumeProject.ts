import type { Project } from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { ProjectRepository } from '../ports/ProjectRepository';
import { changeProject, type ProjectCommandInput } from './projectCommandSupport';

export type ResumeProjectInput = ProjectCommandInput;

export class ResumeProject {
  public constructor(
    readonly repository: ProjectRepository,
    readonly clock: Clock,
  ) {}
  public execute(input: ResumeProjectInput): Promise<Result<Project, DomainError>> {
    return changeProject(this.repository, this.clock, input, (project, now) => project.resume(now));
  }
}
