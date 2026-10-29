import { defineConfig } from '@playwright/test';
import path from 'node:path';
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4321',
    headless: true,
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:4321',
    env: { PORT: '4321', STUDIO_DATA: path.resolve('work/e2e-' + Date.now()) },
    reuseExistingServer: false,
    timeout: 30000,
  },
});
