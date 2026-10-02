import { fileURLToPath, URL } from 'node:url';
import { createServer } from 'vite';

// Local review server. Ignore independent worktrees and build output.
const server = await createServer({
  root: fileURLToPath(new URL('../../../../', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    hmr: false,
    watch: { ignored: ['**/.worktrees/**', '**/dist/**'] },
  },
});
await server.listen();
server.printUrls();
