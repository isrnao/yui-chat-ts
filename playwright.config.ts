import { defineConfig, devices } from '@playwright/test';

/** 外部へ保存しない検証用の接続先。本番の Supabase へは向けない */
const fixtureEnv = {
  VITE_SUPABASE_URL: 'https://native-fixture.invalid',
  VITE_SUPABASE_ANON_KEY: 'fixture-only',
};

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4179', trace: 'retain-on-failure' },
  webServer: [
    {
      env: fixtureEnv,
      command: 'pnpm dev --host 127.0.0.1 --port 4179 --strictPort',
      url: 'http://127.0.0.1:4179',
      reuseExistingServer: !process.env.CI,
    },
    {
      // CI は直前のステップで検証用の設定で build:prod 済み。ローカルでは dist が無かったり .env の値で
      // ビルドされていたりするので、検証用の設定でビルドし直してから配信する（dist は上書きされる）
      env: fixtureEnv,
      command: process.env.CI
        ? 'pnpm preview --host 127.0.0.1 --port 4180 --strictPort'
        : 'pnpm build:prod && pnpm preview --host 127.0.0.1 --port 4180 --strictPort',
      timeout: 300_000,
      url: 'http://127.0.0.1:4180',
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
