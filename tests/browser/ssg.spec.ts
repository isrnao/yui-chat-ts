import { expect, test } from '@playwright/test';
test.beforeEach(async ({ context }) => {
  await context.route(
    /https:\/\/[^/]*(googletagmanager|google-analytics|nr-data)\.[^/]+\//,
    (route) => route.abort()
  );
});
test('production SSG preserves input edited while route JavaScript is delayed', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/assets\/.*\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.route('https://native-fixture.invalid/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    })
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      'yui-chat-settings',
      JSON.stringify({ name: '保存名', email: 'saved@example.com' })
    )
  );
  const errors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /hydration|did not match|server rendered/i.test(message.text())
    )
      errors.push(message.text());
  });
  const hydrationStarted = page.waitForRequest(
    (request) => request.url().includes('native-fixture.invalid') && request.method() === 'GET'
  );
  await page.goto('http://127.0.0.1:4180/chat/superbeginner/', { waitUntil: 'commit' });
  const name = page.getByRole('textbox', { name: 'おなまえ', exact: true });
  const email = page.getByRole('textbox', { name: 'E-Mail/URL', exact: true });
  try {
    await name.fill('先行入力');
    await email.fill('early@example.com');
  } finally {
    release();
  }
  await hydrationStarted;
  await expect(name).toHaveValue('先行入力');
  await expect(email).toHaveValue('early@example.com');
  await page.getByRole('button', { name: 'リセット', exact: true }).click();
  await expect(name).toHaveValue('');
  expect(errors).toEqual([]);
});
