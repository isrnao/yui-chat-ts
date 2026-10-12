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

for (const [alias, target] of [
  ['chat/', '/chat/superbeginner/'],
  ['chanari/', '/chanari/superbeginner/'],
  ['chanari/all/', '/chat/all/'],
  ['does-not-exist/', '/does-not-exist/'],
]) {
  test(`legacy restoration ${alias} preserves URL and state without mismatched hydration`, async ({
    page,
  }) => {
    const errors = hydrationErrors(page);
    const suffix = '?utm_source=campaign&invite_id=a%26b#latest';
    const expected = `http://127.0.0.1:4180${target}${suffix}`;
    await page.goto(
      `http://127.0.0.1:4180/?/${alias}&utm_source=campaign~and~invite_id=a%26b#latest`
    );
    await expect(page).toHaveURL(expected);
    if (alias === 'does-not-exist/')
      await expect(
        page.getByRole('heading', { name: '４０４ＥＲＲＯＲ', exact: true })
      ).toBeVisible();
    else
      await expect(
        page.getByRole('button', { name: 'チャットに参加する', exact: true })
      ).toBeEnabled();
    expect(await page.evaluate(() => history.state)).toEqual({ source: 'fixture', scroll: 120 });
    // 再読込と文書間の戻る/進むでも正規URLを保持する。
    await page.reload();
    await expect(page).toHaveURL(expected);
    await page.goto('http://127.0.0.1:4180/');
    await page.goBack();
    await expect(page).toHaveURL(expected);
    await page.goForward();
    await expect(page).toHaveURL('http://127.0.0.1:4180/');
    expect(errors).toEqual([]);
  });
}
