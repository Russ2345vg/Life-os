import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AiAssistantService, AiError } from '../../src/application/ai/AiAssistant';
import { OpenAiPanel } from '../../src/presentation/planner-v2/OpenAiPanel';
import { ContextualAiAssistant } from '../../src/presentation/planner-v2/ContextualAiAssistant';
import { WhatIfAssistant } from '../../src/presentation/planner-v2/WhatIfAssistant';
import { compareWhatIf } from '../../src/application/ai/WhatIfComparison';
import type { AnalyticsSnapshot } from '../../src/application/ports/AnalyticsSnapshotReader';
import type { AiContext, ReadAiContext } from '../../src/application/ai/AiContext';
import '../../src/presentation/styles/global.css';
import '../../src/presentation/planner-v2/planner-v2.css';
import '../../src/presentation/planner-v2/planner-master.css';
import '../../src/presentation/planner-v2/account-sync.css';
import '../../src/presentation/planner-v2/planner-premium.css';

const mode = new URLSearchParams(location.search).get('mode');
const contextual = new URLSearchParams(location.search).has('contextual');
const whatIf = new URLSearchParams(location.search).has('whatif');
let count = 0;
const service =
  mode === 'unavailable'
    ? new AiAssistantService()
    : new AiAssistantService(
        {
          ask: async (question, _signal, context) => {
            document.documentElement.dataset.requests = String(++count);
            document.documentElement.dataset.question = question;
            if (context) document.documentElement.dataset.section = context.section;
            if (mode === 'pending') return new Promise(() => undefined);
            if (mode === 'error') throw new AiError('rate_limited');
            return 'Первый шаг: начните с небольшого действия.\n<script>unsafe</script>';
          },
        },
        { current: async () => ({ isAnonymous: false, emailVerified: true }) },
      );
const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
const context: AiContext = {
  version: 1,
  section: 'analytics',
  date: '2026-10-03',
  period: { start: '2026-09-28', end: '2026-10-04' },
  facts: ['Выполнено действий: 3'],
  omittedCount: 0,
  sources: [
    { id: 'action-1', kind: 'actions', title: 'Прогулка', date: '2026-10-01', detail: 'Выполнено' },
    {
      id: 'diary:day:2026-10-02',
      kind: 'diary',
      title: 'Дневник: 2026-10-02',
      date: '2026-10-02',
      detail: 'Энергия: 3',
    },
    {
      id: '2026-10-02',
      kind: 'sleep',
      title: 'Подготовка ко сну 2026-10-02',
      date: '2026-10-02',
      detail: 'Статус: ALL_DONE',
    },
  ],
};
const emptySnapshot: AnalyticsSnapshot = {
  actions: [],
  sessions: [],
  goals: [],
  contributions: [],
  diary: [],
  balance: [],
  walks: [],
  memory: [],
  sleep: null,
  spheres: [],
  directions: [],
};
const reader = {
  read: async () => context,
  compareWhatIf: async (input: Parameters<ReadAiContext['compareWhatIf']>[0]) =>
    compareWhatIf({ ...input, timeZone: 'Asia/Chita' }, emptySnapshot),
} as ReadAiContext;
createRoot(root).render(
  <StrictMode>
    <div className="planner-v2" style={{ display: 'block', minHeight: '100vh' }}>
      <main className="planner-content">
        {whatIf ? (
          <div className="contextual-ai">
            <WhatIfAssistant service={service} reader={reader} date="2026-10-03" />
          </div>
        ) : contextual ? (
          <ContextualAiAssistant
            service={service}
            reader={reader}
            scope={{ section: 'analytics', date: '2026-10-03', period: 'month' }}
            scopeKey="analytics-fixture"
            onNavigate={(route) => {
              document.documentElement.dataset.route = JSON.stringify(route);
            }}
            onCapture={async (title) => {
              document.documentElement.dataset.saved = title;
            }}
          />
        ) : (
          <OpenAiPanel service={service} />
        )}
      </main>
    </div>
  </StrictMode>,
);
