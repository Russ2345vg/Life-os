import { defineConfig, devices } from '@playwright/test';

declare const process: {
  readonly env: {
    readonly LIFEOS_E2E_PORT?: string;
    readonly LIFEOS_E2E_SHARD_INDEX?: string;
    readonly LIFEOS_E2E_BLOB_OUTPUT_FILE?: string;
  };
};

const port = process.env.LIFEOS_E2E_PORT ?? '4173';
const baseURL = `http://127.0.0.1:${port}`;
const shardIndex = process.env.LIFEOS_E2E_SHARD_INDEX;
const blobOutputFile = process.env.LIFEOS_E2E_BLOB_OUTPUT_FILE;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: shardIndex ? `test-results/shard-${shardIndex}` : 'test-results',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  globalTimeout: 1_800_000,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [
    ['./scripts/test-infrastructure/progress-reporter.mjs', { heartbeatMs: 10_000 }],
    blobOutputFile
      ? ['blob', { outputFile: blobOutputFile }]
      : [
          'html',
          {
            open: 'never',
            outputFolder: shardIndex
              ? `playwright-report/shard-${shardIndex}`
              : 'playwright-report',
          },
        ],
  ],
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
