import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/fixtures/native.html');
});

test('modal owns focus, cancellation and focus restoration', async ({ page }) => {
  const opener = page.getByRole('button', { name: '確認を開く' });
  await opener.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'やめる' })).toBeFocused();
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => document.querySelector('dialog')!.contains(document.activeElement))
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test('popover light dismiss and narrow viewport placement', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.getByRole('button', { name: '操作一覧' }).click();
  await expect(page.getByRole('button', { name: '通報' })).toBeVisible();
  const bounds = await page.locator('#actions').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '通報' })).not.toBeVisible();
});

test('reduced motion and textarea remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByLabel('詳細').fill('説明\n'.repeat(20));
  await expect(page.getByLabel('詳細')).toHaveValue('説明\n'.repeat(20));
  await page.getByRole('button', { name: '確認を開く' }).click();
  await page.getByRole('button', { name: 'やめる' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
