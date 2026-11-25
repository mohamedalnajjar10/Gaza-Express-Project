import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/compose',
  workers: 1,
  timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:15050', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
