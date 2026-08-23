import { describe, expect, it, vi } from 'vitest';
import { EntityId } from '../../domain';
import { createDecisionDraft } from '../../test/helpers/DecisionTestFactory';
import { GetDecisionsForProject } from './GetDecisionsForProject';

describe('GetDecisionsForProject', () => {
  it('делегирует выборку одному специализированному чтению без поэлементных запросов', async () => {
    const projectId = EntityId.create('project-query');
    const decisions = [createDecisionDraft('project-decision')];
    const findByProjectId = vi.fn().mockResolvedValue(decisions);
    const query = new GetDecisionsForProject({ findByProjectId });

    await expect(query.execute(projectId)).resolves.toBe(decisions);
    expect(findByProjectId).toHaveBeenCalledOnce();
    expect(findByProjectId).toHaveBeenCalledWith(projectId);
  });
});
