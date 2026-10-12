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

test('audio activation is explicit and separate from mute', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/components.html');
  await page.getByRole('button', { name: '通知音を有効にする', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '通知音の再生が可能です', exact: true })
  ).toBeDisabled();
  await page.getByLabel('通知音をミュート').check();
  await expect(page.getByLabel('通知音をミュート')).toBeChecked();
});
test('reduced motion hides animated decoration and very short viewport preserves controls', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 200 });
  await page.goto('/tests/browser/fixtures/components.html');
  await page.getByRole('textbox', { name: 'おなまえ', exact: true }).fill('短い画面');
  await page.getByRole('button', { name: 'チャットに参加する' }).click();
  await page.getByRole('textbox', { name: '発言', exact: true }).fill('短い画面でも送信');
  await page.getByRole('button', { name: '発言', exact: true }).click();
  await expect(page.getByLabel('送信結果')).toHaveText('短い画面でも送信');
});

test('chanari local draft and display-only fields work at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/tests/browser/fixtures/components.html?chanari=1');
  await expect(page.getByLabel('エフェクト', { exact: true })).toBeDisabled();
  const input = page.getByRole('textbox', { name: '発言', exact: true });
  await input.fill('部屋別の下書き');
  await page.getByRole('button', { name: 'チャットで発言する', exact: true }).click();
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: '発言復元', exact: true }).click();
  await expect(input).toHaveValue('部屋別の下書き');
  const box = await input.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
});

test('top counts distinguish failure from zero and readonly allows partial selection', async ({
  page,
}) => {
  let calls = 0;
  await page.route('https://native-fixture.invalid/**', (route) =>
    route.fulfill({
      status: calls++ === 0 ? 500 : 200,
      contentType: 'application/json',
      body: '[]',
    })
  );
  await page.route('https://platform.twitter.com/**', (route) => route.abort());
  await page.route('https://ar-cdn.net/**', (route) => route.abort());
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/tests/browser/fixtures/components.html?top=1');
  await page.getByRole('button', { name: '再試行', exact: true }).first().click();
  await expect(page.getByText('0人', { exact: true }).first()).toBeVisible();
  const tag = page.getByRole('textbox', { name: /お気楽チャット紹介リンク/ });
  await tag.focus();
  expect(
    await tag.evaluate(
      (element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart
    )
  ).toBeGreaterThan(10);
  await tag.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(2, 8));
  await expect(tag).toHaveAttribute('readonly');
  expect(
    await tag.evaluate(
      (element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart
    )
  ).toBe(6);
});

test('disabled-route two-shot components preserve confirmation and radio keyboard rules', async ({
  page,
}) => {
  await page.goto('/tests/browser/fixtures/components.html?two-shot=1');
  await page.getByRole('button', { name: '閉鎖', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'やめる' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('専用操作回数')).toHaveText('0');
  await page.getByRole('button', { name: '相手を退室', exact: true }).click();
  await dialog.getByRole('button', { name: '実行する', exact: true }).click();
  await expect(page.getByLabel('専用操作回数')).toHaveText('1');
  await page.getByRole('radio', { name: 'なし', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '自動(20秒)', exact: true })).toBeChecked();
  await expect(page.getByLabel('radio変更回数')).toHaveText('1');
  const splitter = page.getByRole('separator', { name: 'フレームの境界' });
  await splitter.focus();
  await page.keyboard.press('End');
  expect(await splitter.getAttribute('aria-valuenow')).toBe(
    await splitter.getAttribute('aria-valuemax')
  );
  await page.keyboard.press('Home');
  expect(await splitter.getAttribute('aria-valuenow')).toBe(
    await splitter.getAttribute('aria-valuemin')
  );
});
