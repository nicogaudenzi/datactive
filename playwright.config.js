import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 20000,
  fullyParallel: true,
  reporter: 'list',
  use: {baseURL: 'http://127.0.0.1:4178', headless: true},
  webServer: {command: 'npm run dev -- --host 127.0.0.1 --port 4178', url: 'http://127.0.0.1:4178/tests/browser/harness.html', reuseExistingServer: !process.env.CI, timeout: 30000}
});
