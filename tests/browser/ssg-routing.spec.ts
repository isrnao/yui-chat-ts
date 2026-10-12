import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context, page }) => {
  await context.route(
    /https:\/\/[^/]*(googletagmanager|google-analytics|nr-data)\.[^/]+\//,
    (route) => route.abort()
  );
  await page.route('https://native-fixture.invalid/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.addInitScript(() => {
    if (!history.state) history.replaceState({ source: 'fixture', scroll: 120 }, '', location.href);
  });
});

function hydrationErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  const relevant = /hydration|did not match|server rendered|#418/i;
  page.on('console', (message) => {
    if (message.type() === 'error' && relevant.test(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (relevant.test(error.message)) errors.push(error.message);
  });
  return errors;
}

for (const marker of ['missing', 'wrong-route']) {
  test(`renders a room from top HTML with ${marker} without hydrating it`, async ({ page }) => {
    const errors = hydrationErrors(page);
    await page.route('**/chat/anime/', async (route) => {
      // Pagesの旧fallbackと同様に、部屋URLへトップのSSGを返す。
      const response = await route.fetch({ url: 'http://127.0.0.1:4180/' });
      const body = await response.text();
      await route.fulfill({
        response,
        body: marker === 'missing' ? body.replace(/ data-ssg-path="[^"]*"/, '') : body,
      });
    });
    await page.goto('http://127.0.0.1:4180/chat/anime/');
    await expect(
      page.getByRole('button', { name: 'チャットに参加する', exact: true })
    ).toBeEnabled();
    await expect(page.getByRole('textbox', { name: 'おなまえ', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('legacy SPA query no longer rewrites the document route', async ({ page }) => {
  const url = 'http://127.0.0.1:4180/?/does-not-exist/&utm_source=campaign#latest';
  await page.goto(url);
  await expect(page).toHaveURL(url);
  await expect(page.locator('#root main')).toBeVisible();
  expect(await page.locator('#root').getAttribute('data-ssg-path')).toBe('/');
});
