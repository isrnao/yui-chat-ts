import { expect, test } from '@playwright/test';

test.use({ baseURL: 'http://127.0.0.1:4181' });
test.beforeEach(async ({ context, page }) => {
  await context.route(
    /https:\/\/[^/]*(googletagmanager|google-analytics|nr-data|platform.twitter|ar-cdn)\.[^/]+\//,
    (route) => route.abort()
  );
  await page.route('https://native-fixture.invalid/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
});

const aliases = [
  { path: '/chat/', target: '/chat/superbeginner/' },
  { path: '/chanari/', target: '/chanari/superbeginner/' },
  { path: '/chanari/all/', target: '/chat/all/' },
];

test('canonical static pages return HTTP 200 with matching SSG and SEO', async ({ request }) => {
  for (const path of [
    '/',
    '/chat/superbeginner/',
    '/chat/all/',
    '/chanari/durarara/',
    '/chat/2shot/',
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(`data-ssg-path="${path}"`);
    expect(html).toContain('<main');
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    const canonical = path.startsWith('/chanari/') ? path.replace('/chanari/', '/chat/') : path;
    expect(html).toContain(`<link rel="canonical" href="https://www.okiraku.chat${canonical}"`);
  }
});

test('directory redirect preserves query and leaves the fragment to the browser', async ({
  request,
  page,
}) => {
  const response = await request.get('/chat?utm_source=campaign', { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe('/chat/?utm_source=campaign');
  await page.goto('/chat?utm_source=campaign#latest');
  await expect(page).toHaveURL(
    'http://127.0.0.1:4181/chat/superbeginner/?utm_source=campaign#latest'
  );
});

for (const alias of aliases) {
  test(`${alias.path} serves its destination HTML and preserves history metadata`, async ({
    page,
    request,
  }) => {
    const html = await (await request.get(alias.path)).text();
    expect(html).toContain(`data-ssg-path="${alias.target}"`);
    await page.addInitScript(() => {
      if (!history.state) history.replaceState({ restored: true }, '', location.href);
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      if (/hydrat|#418/i.test(error.message)) errors.push(error.message);
    });
    const suffix = '?utm_source=campaign&invite_id=a%26b#latest';
    await page.goto(alias.path + suffix);
    const expected = `http://127.0.0.1:4181${alias.target}${suffix}`;
    await expect(page).toHaveURL(expected);
    await expect(
      page.getByRole('button', { name: 'チャットに参加する', exact: true })
    ).toBeEnabled();
    expect(await page.evaluate(() => history.state)).toEqual({ restored: true });
    await page.reload();
    await expect(page).toHaveURL(expected);
    await page.goto('/');
    await page.goBack();
    await expect(page).toHaveURL(expected);
    await page.goForward();
    await expect(page).toHaveURL('http://127.0.0.1:4181/');
    expect(errors).toEqual([]);
  });
}

test('unknown routes return HTTP 404 with static content and no SPA restoration', async ({
  page,
}) => {
  const url = 'http://127.0.0.1:4181/does-not-exist/?utm_source=campaign#latest';
  const response = await page.goto(url);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: '４０４ＥＲＲＯＲ', exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'お気楽チャットにもどる', exact: true })
  ).toHaveAttribute('href', '/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  expect(await page.locator('link[rel="canonical"], script').count()).toBe(0);
  await page.reload();
  await expect(page).toHaveURL(url);
});

test.describe('JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });
  for (const alias of aliases) {
    test(`${alias.path} keeps readable entry HTML and a real canonical link`, async ({ page }) => {
      await page.goto(alias.path + '?utm_source=campaign#latest');
      await expect(page.getByRole('textbox', { name: 'おなまえ', exact: true })).toBeEditable();
      await expect(
        page.getByRole('button', { name: 'チャットに参加する', exact: true })
      ).toBeDisabled();
      await expect(page).toHaveURL(`http://127.0.0.1:4181${alias.path}?utm_source=campaign#latest`);
      const link = page.getByRole('link', { name: '部屋の入口へ', exact: true });
      await expect(link).toHaveAttribute('href', alias.target);
      await link.click();
      await expect(page).toHaveURL(`http://127.0.0.1:4181${alias.target}`);
    });
  }
  test('unknown URL has a readable 404 and a working home link', async ({ page }) => {
    const response = await page.goto('/does-not-exist/');
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: '４０４ＥＲＲＯＲ', exact: true })
    ).toBeVisible();
    await page.getByRole('link', { name: 'お気楽チャットにもどる', exact: true }).click();
    await expect(page).toHaveURL('http://127.0.0.1:4181/');
  });
});
