import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: {
  readonly env: {
    readonly TAURI_DEV_HOST?: string;
  };
};

const tauriDevHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: tauriDevHost || false,
    port: 5173,
    strictPort: true,
    hmr: tauriDevHost
      ? {
          protocol: 'ws',
          host: tauriDevHost,
          port: 5174,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**', '**/playwright-report/**', '**/test-results/**'],
    },
  },
});
