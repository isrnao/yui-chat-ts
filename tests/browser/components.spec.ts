import { test, expect } from '@playwright/test';

test('production forms and splitter work within a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/tests/browser/fixtures/components.html');
  await page.getByRole('textbox', { name: 'おなまえ', exact: true }).fill('テスト');
  await expect(page.getByLabel('カラーナビ', { exact: true })).not.toHaveAttribute(
    'tabindex',
    '-1'
  );
  await page.getByRole('button', { name: 'チャットに参加する' }).click();
  await expect(page.getByRole('button', { name: '[退室]', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '更新', exact: true })).not.toHaveAttribute(
    'tabindex',
    '-1'
  );
  await page.getByRole('textbox', { name: '発言', exact: true }).fill('こんにちは');
  await page.getByRole('button', { name: '発言', exact: true }).click();
  await expect(page.getByLabel('送信結果')).toHaveText('こんにちは');
  const separator = page.getByRole('separator', { name: '上下の領域を分割するバー' });
  await separator.focus();
  await page.keyboard.press('End');
  expect(await separator.getAttribute('aria-valuenow')).toBe(
    await separator.getAttribute('aria-valuemax')
  );
  await page.keyboard.press('Home');
  expect(await separator.getAttribute('aria-valuenow')).toBe(
    await separator.getAttribute('aria-valuemin')
  );
});
