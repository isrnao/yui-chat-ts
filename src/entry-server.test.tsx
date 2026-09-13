import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { act } from '@testing-library/react';
import App from './App';
import { preloadRoute } from './routes/routeLoaders';
import { render } from './entry-server';

vi.mock('@features/top/api/roomCountsApi', () => ({
  fetchRoomParticipantCounts: vi.fn().mockResolvedValue({}),
}));

vi.mock('@features/chat/api/chatApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@features/chat/api/chatApi')>();
  return {
    ...actual,
    loadChatLogs: vi.fn(() => Promise.resolve([])),
    subscribeChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
    onLookBroadcast: vi.fn(() => vi.fn()),
  };
});

/** hydration の不一致は console.error で報告される */
function collectHydrationErrors() {
  const messages: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    messages.push(args.map(String).join(' '));
  });
  return {
    messages,
    restore: () => spy.mockRestore(),
    hydrationWarnings: () =>
      messages.filter((m) => /hydrat|did not match|server rendered|Text content/i.test(m)),
  };
}

describe('SSG + hydrateRoot', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  async function ssgThenHydrate(pathname: string) {
    window.history.replaceState(null, '', pathname);
    const markup = await render(pathname);

    document.body.innerHTML = `<div id="root" data-ssg="1">${markup}</div>`;
    const container = document.getElementById('root')!;

    const captured = collectHydrationErrors();
    await preloadRoute(pathname);
    await act(async () => {
      hydrateRoot(
        container,
        <StrictMode>
          <App />
        </StrictMode>
      );
    });

    const warnings = captured.hydrationWarnings();
    captured.restore();
    return { markup, container, warnings };
  }

  it('トップページを SSG し、不一致なく hydrate できる', async () => {
    const { markup, warnings } = await ssgThenHydrate('/');

    // JS を待たずに本文が読める = LCP 要素が HTML に入っている
    expect(markup).toContain('お気楽チャット');
    expect(markup.length).toBeGreaterThan(1000);
    expect(warnings).toEqual([]);
  });

  it('部屋ページは EntryForm まで SSG され、不一致なく hydrate できる', async () => {
    const { markup, warnings } = await ssgThenHydrate('/chat/superbeginner');

    // 入室フォームが HTML に含まれる = JS 到着前に入力欄が見える
    expect(markup).toContain('おなまえ');
    expect(markup).toContain('<input');
    expect(warnings).toEqual([]);
  });

  // 「前回の名前を覚えている」機能が SSG 化で壊れないことの回帰テスト。
  // 入力 state を useState でコピーすると、SSG 時の既定値 (空) を握ったままになり、
  // hydration 後にストアが実値へ切り替わっても追随しない。
  it('hydration 後にストア由来のおなまえが入力欄へ反映される', async () => {
    // settingsStore はモジュール読み込み時に localStorage を読むため、
    // 後から localStorage を書いても反映されない。公開 API で更新する。
    const settingsStore = await import('@features/chat/utils/settingsStore');
    settingsStore.updateSettings({ name: 'ゆい' });

    const { container, warnings } = await ssgThenHydrate('/chat/superbeginner');

    const values = Array.from(container.querySelectorAll('input')).map((el) => el.value);
    expect(values).toContain('ゆい');
    expect(warnings).toEqual([]);
  });

  // アバターは EntryForm 内の state。name と同じく useState でコピーすると
  // SSG 時の 'none' を握ったままになり、保存済みアバターが復元されない
  it('hydration 後にストア由来のアバターが選択状態になる', async () => {
    const settingsStore = await import('@features/chat/utils/settingsStore');
    settingsStore.updateSettings({ avatar: 'hoshi1' });

    const { container, warnings } = await ssgThenHydrate('/chat/superbeginner');

    const checked = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    ).filter((el) => el.checked);

    expect(checked.map((el) => el.value)).toContain('hoshi1');
    expect(warnings).toEqual([]);
  });
});
