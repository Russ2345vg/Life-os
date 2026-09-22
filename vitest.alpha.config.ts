import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/test/alpha/CurrentWorkspaceGate.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
