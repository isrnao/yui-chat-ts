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

test('production dialog supports cancel, safe confirmation and declarative reopening', async ({
  page,
}) => {
  await page.goto('/tests/browser/fixtures/components.html');
  const opener = page.getByRole('button', { name: '確認を開く' });
  await opener.click();
  const dialog = page.getByRole('alertdialog', { name: '確認', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'やめる' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect(page.getByLabel('確定回数')).toHaveText('0');
  await opener.click();
  await dialog.getByTestId('filter-confirm-haptic-switch').click();
  await expect(page.getByLabel('確定回数')).toHaveText('1');
  const listOpener = page.getByRole('button', { name: '一覧を開く' });
  for (let i = 0; i < 2; i++) {
    await listOpener.click();
    await expect(page.getByRole('dialog', { name: 'フィルタ', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(listOpener).toBeFocused();
  }
});
test('production fallback traps focus and cancels without invoking confirmation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto('/tests/browser/fixtures/components.html');
  await page.getByRole('button', { name: '確認を開く' }).click();
  const dialog = page.getByRole('alertdialog', { name: '確認', exact: true });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'フィルタする' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('確定回数')).toHaveText('0');
});
