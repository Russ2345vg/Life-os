import { ESLint } from 'eslint';
import { describe, expect, test } from 'vitest';

const eslint = new ESLint();
const fixtures = [
  {
    filePath: 'src/app/composition/LifeOsApplication.ts',
    forbidden: '../../presentation/planner-v2/PlannerWorkspace',
    allowed: '../../application/planner/PlannerServices',
  },
  {
    filePath: 'src/app/composition/modules/createMemoryModule.ts',
    forbidden: '../../../presentation/planner-v2/PlannerWorkspace',
    allowed: '../../../application/memory/MemoryServices',
  },
];

describe('application module boundaries', () => {
  test.each(fixtures)('rejects presentation type imports in $filePath', async (fixture) => {
    const [result] = await eslint.lintText(
      `import type { PlannerServices } from '${fixture.forbidden}'; export type Probe = PlannerServices;`,
      { filePath: fixture.filePath },
    );
    expect(result.messages).toContainEqual(
      expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 }),
    );
  });

  test.each(fixtures)('allows application type imports in $filePath', async (fixture) => {
    const [result] = await eslint.lintText(
      `import type { Services } from '${fixture.allowed}'; export type Probe = Services;`,
      { filePath: fixture.filePath },
    );
    expect(result.errorCount).toBe(0);
  });

  test('keeps presentation helpers available to composition integration tests', async () => {
    const [result] = await eslint.lintText(
      "import type { PlannerServices } from '../../../presentation/planner-v2/PlannerWorkspace'; export type Probe = PlannerServices;",
      { filePath: 'src/app/composition/modules/Memory.integration.test.ts' },
    );
    expect(result.errorCount).toBe(0);
  });
});
