import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AiAssistantService, AiError } from '../../src/application/ai/AiAssistant';
import { OpenAiPanel } from '../../src/presentation/planner-v2/OpenAiPanel';
import '../../src/presentation/styles/global.css';
import '../../src/presentation/planner-v2/planner-v2.css';
import '../../src/presentation/planner-v2/planner-master.css';
import '../../src/presentation/planner-v2/account-sync.css';
import '../../src/presentation/planner-v2/planner-premium.css';

const mode = new URLSearchParams(location.search).get('mode');
let count = 0;
const service =
  mode === 'unavailable'
    ? new AiAssistantService()
    : new AiAssistantService(
        {
          ask: async (question) => {
            document.documentElement.dataset.requests = String(++count);
            document.documentElement.dataset.question = question;
            if (mode === 'pending') return new Promise(() => undefined);
            if (mode === 'error') throw new AiError('rate_limited');
            return 'Первый шаг: начните с небольшого действия.\n<script>unsafe</script>';
          },
        },
        { current: async () => ({ isAnonymous: false, emailVerified: true }) },
      );
const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(
  <StrictMode>
    <div className="planner-v2" style={{ display: 'block', minHeight: '100vh' }}>
      <main className="planner-content">
        <OpenAiPanel service={service} />
      </main>
    </div>
  </StrictMode>,
);
