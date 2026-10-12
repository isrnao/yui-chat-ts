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

test('1000 production rows share one action panel and reach filter/report by keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/tests/browser/fixtures/components.html');
  await expect(page.locator('[data-message-actions]')).toHaveCount(1000);
  await expect(page.locator('.message-action-panel')).toHaveCount(1);
  const opener = page.getByRole('button', { name: '利用者0の発言への操作', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('group', { name: '発言への操作' });
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await panel.getByRole('button', { name: '名前をフィルタ', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await opener.click();
  await panel.getByRole('button', { name: '通報する', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'この発言を運営に通報しますか？', exact: true })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});
test('popover unavailable keeps panel hidden and offers ordinary buttons', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto('/tests/browser/fixtures/components.html');
  const panel = page.locator('.message-action-panel');
  await expect(panel).not.toBeVisible();
  await page.getByRole('button', { name: '利用者0の発言への操作', exact: true }).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
});
