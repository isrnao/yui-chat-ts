import { describe, it, expect, vi, afterEach } from 'vitest';
import { lazy } from 'react';
import { render, screen } from '@testing-library/react';
import { RouteHost } from './RouteHost';

/** 解決しない lazy = チャンク取得が遅い / 止まっている状態 */
const NeverResolving = lazy(() => new Promise<never>(() => {}));

/** 失敗する lazy = チャンク取得に失敗した状態 (デプロイでハッシュが変わった等) */
const Failing = lazy(() => Promise.reject(new Error('chunk load failed')));

describe('RouteHost', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // fallback を空要素にすると、遅い回線で白画面と区別がつかない
  it('チャンク取得が終わらない間は読み込み状況を role="status" で伝える', () => {
    render(
      <RouteHost>
        <NeverResolving />
      </RouteHost>
    );

    expect(screen.getByRole('status')).toHaveTextContent('読み込み中');
  });

  it('チャンク取得に失敗したらエラー表示と再読み込み導線を出す', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <RouteHost>
        <Failing />
      </RouteHost>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('ページの読み込みに失敗しました');
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();
    // ホワイトスクリーンにしない = 読み込み表示のままにもしない
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    consoleError.mockRestore();
  });
});
