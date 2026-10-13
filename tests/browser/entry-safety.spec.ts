import { expect, test } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';

async function blockTelemetry(context: BrowserContext) {
  await context.route(
    /https:\/\/[^/]*(googletagmanager|google-analytics|nr-data)\.[^/]+\//,
    (route) => route.abort()
  );
}
test.beforeEach(async ({ context }) => blockTelemetry(context));

const cases = [
  { path: '/chat/superbeginner/', name: 'おなまえ' },
  { path: '/chanari/superbeginner/', name: 'おなまえ' },
];

for (const entry of cases) {
  for (const mode of ['no-js', 'failed-chunk', 'csp'] as const) {
    test(`${entry.path} blocks native GET submission with ${mode}`, async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: mode !== 'no-js' });
      await blockTelemetry(context);
      const page = await context.newPage();
      const navigations: string[] = [];
      page.on('request', (request) => {
        if (request.isNavigationRequest()) navigations.push(request.url());
      });
      if (mode === 'failed-chunk') await page.route(/\/assets\/.*\.js$/, (route) => route.abort());
      if (mode === 'csp')
        await page.route(`**${entry.path}`, async (route) => {
          const response = await route.fetch();
          await route.fulfill({
            response,
            headers: { ...response.headers(), 'content-security-policy': "script-src 'none'" },
          });
        });
      try {
        const url = `http://127.0.0.1:4180${entry.path}`;
        await page.goto(url);
        const name = page.getByRole('textbox', { name: entry.name, exact: true });
        await name.fill('先行入力');
        if (entry.path.startsWith('/chat/'))
          await page
            .getByRole('textbox', { name: 'E-Mail/URL', exact: true })
            .fill('early@example.invalid');
        const submit = page.locator('form [type="submit"]').first();
        await expect(submit).toBeDisabled();
        await name.press('Enter');
        // disabled controls cannot be clicked by Playwright: issue the real pointer event directly.
        const box = await submit.boundingBox();
        await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
        await page.getByText('入室できないとき', { exact: true }).click();
        await expect(page.getByRole('link', { name: '再読み込み', exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: 'トップへ戻る', exact: true })).toBeVisible();
        expect(page.url()).toBe(url);
        expect(navigations).toEqual([url]);
      } finally {
        await context.close();
      }
    });
  }

  test(`${entry.path} preserves early input before enabling submit`, async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/assets\/.*\.js$/, async (route) => {
      await gate;
      await route.continue();
    });
    await page.route('https://native-fixture.invalid/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page.addInitScript(() => {
      localStorage.setItem('yui-chat-settings', JSON.stringify({ name: '保存名' }));
      localStorage.setItem(
        'chanari-retro-chat-ui:draft:v1',
        JSON.stringify({
          superbeginner: {
            version: 1,
            roomId: 'superbeginner',
            name: '保存名',
            nameColor: '#123456',
            speechColor: '#654321',
            updatedAt: Date.now(),
          },
        })
      );
    });
    const url = `http://127.0.0.1:4180${entry.path}`;
    await page.goto(url, { waitUntil: 'commit' });
    const name = page.getByRole('textbox', { name: entry.name, exact: true });
    const submit = page.locator('form [type="submit"]').first();
    try {
      await name.fill('先行入力');
      await expect(submit).toBeDisabled();
      await name.press('Enter');
      expect(page.url()).toBe(url);
    } finally {
      release();
    }
    await expect(submit).toBeEnabled();
    await expect(name).toHaveValue('先行入力');
  });
}
