import { expect, test } from '@playwright/test';

type HeadProbe = { before: string; writes: number };
type ProbedWindow = Window & { seoProbe: HeadProbe; documentToken: string };

test.beforeEach(async ({ context, page }) => {
  await context.route(
    /https:\/\/[^/]*(googletagmanager|google-analytics|nr-data)\.[^/]+\//,
    (route) => route.abort()
  );
  await page.route('https://native-fixture.invalid/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
});

for (const path of ['/', '/chat/anime/', '/chat/all/', '/chanari/anime/', '/chat/2shot/']) {
  test(`preserves the static SEO head through hydration at ${path}`, async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/assets\/.*\.js$/, async (route) => {
      await gate;
      await route.continue();
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      if (/hydration|did not match|server rendered|#418/i.test(error.message))
        errors.push(error.message);
    });
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        /hydration|did not match|server rendered/i.test(message.text())
      )
        errors.push(message.text());
    });
    await page.goto(`http://127.0.0.1:4181${path}`, { waitUntil: 'commit' });
    try {
      await expect(page.locator('#root main')).toBeVisible();
      await page.evaluate(() => {
        const selector =
          'title, meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], script[type="application/ld+json"]';
        const before = Array.from(
          document.head.querySelectorAll(selector),
          (node) => node.outerHTML
        ).join('');
        (window as ProbedWindow).seoProbe = { before, writes: 0 };
        const isSeoNode = (node: Node) => {
          const element = node instanceof Element ? node : node.parentElement;
          return !!element?.closest(selector);
        };
        new MutationObserver((changes) => {
          (window as ProbedWindow).seoProbe.writes += changes.filter(
            (change) =>
              isSeoNode(change.target) ||
              [...change.addedNodes, ...change.removedNodes].some(isSeoNode)
          ).length;
        }).observe(document.head, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true,
        });
      });
    } finally {
      release();
    }
    await page.waitForLoadState('networkidle');
    if (path !== '/') await expect(page.locator('form [type="submit"]').first()).toBeEnabled();
    const result = await page.evaluate(() => {
      const selector =
        'title, meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], script[type="application/ld+json"]';
      return {
        ...(window as ProbedWindow).seoProbe,
        after: Array.from(document.head.querySelectorAll(selector), (node) => node.outerHTML).join(
          ''
        ),
      };
    });
    expect(result.before).toContain('<title>');
    expect(result.before).toContain('rel="canonical"');
    expect(result.after).toBe(result.before);
    expect(result.writes).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('native room links navigate documents with correct SEO on back and forward', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as ProbedWindow).documentToken = crypto.randomUUID();
  });
  const top = 'http://127.0.0.1:4181/?utm_source=mpa#main-content';
  await page.goto(top);
  const topTitle = await page.title();
  const topDocument = await page.evaluate(() => (window as ProbedWindow).documentToken);
  const room = page.locator('a[href="/chat/superbeginner/"]').first();
  await room.click();
  await expect(page).toHaveURL('http://127.0.0.1:4181/chat/superbeginner/');
  // ChromiumはSpeculation Rulesのprefetch済み文書を使うことがある。
  // リクエストの発生ではなく、新しい文書の生成を確認する。
  expect(await page.evaluate(() => (window as ProbedWindow).documentToken)).not.toBe(topDocument);
  await expect(page.locator('form [type="submit"]').first()).toBeEnabled();
  const roomTitle = await page.title();
  expect(roomTitle).not.toBe(topTitle);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://www.okiraku.chat/chat/superbeginner/'
  );
  await page.goBack();
  await expect(page).toHaveURL(top);
  await expect(page).toHaveTitle(topTitle);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://www.okiraku.chat/'
  );
  await page.goForward();
  await expect(page).toHaveTitle(roomTitle);
  await expect(page.locator('form [type="submit"]').first()).toBeEnabled();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://www.okiraku.chat/chat/superbeginner/'
  );
});
