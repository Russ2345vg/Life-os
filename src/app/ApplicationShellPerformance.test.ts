import { describe, expect, it } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а производственный tsconfig не подключает Node-типы.
import { readFileSync } from 'node:fs';

const applicationShell = readFileSync(new URL('./ApplicationShell.tsx', import.meta.url), 'utf8');
const managementPage = readFileSync(
  new URL('../presentation/management/ManagementPage.tsx', import.meta.url),
  'utf8',
);

describe('ApplicationShell performance contract', () => {
  it('loads heavy top-level pages through dynamic imports', () => {
    for (const page of [
      'ActionsPage',
      'DecisionsPage',
      'HistoryPage',
      'ManagementPage',
      'RoutinePage',
      'TodayPage',
      'WalksPage',
    ]) {
      expect(applicationShell).toContain(`const ${page} = lazy(`);
    }
    expect(applicationShell).toContain('<Suspense');
  });

  it('loads heavy management subsections only after they are opened', () => {
    expect(managementPage).toContain("import('./DirectionsSection')");
    expect(managementPage).not.toContain("import('./ProjectsSection')");
    expect(managementPage).toContain('const GoalAlbumPage = lazy(');
    expect(managementPage).toContain("import('../goals/GoalAlbumPage')");
    expect(managementPage).toContain('<Suspense');
  });

  it('показывает fail-soft уведомление без технических деталей и даёт повторить чтение', () => {
    expect(applicationShell).toContain('Не удалось загрузить часть локальных данных.');
    expect(applicationShell).toContain('Повторить');
    expect(applicationShell).toContain('setStartupRetryToken');
    expect(applicationShell).not.toContain('stack trace');
  });
});
