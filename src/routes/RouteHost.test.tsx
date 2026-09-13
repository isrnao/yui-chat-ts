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

  // 軽量なサイトなので、出せるものから順に出すほうが体感が良い。
  // 全画面の読み込み表示を挟むと初期描画の体感が悪化するため出さない。
  // (トップは lazy にしていないので、この境界に入るのはチャット系ルートのみ)
  it('チャンク待機中に読み込み表示を挟まない', () => {
    const { container } = render(
      <RouteHost>
        <NeverResolving />
      </RouteHost>
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
  });

  // 待機中に何も出さない方針でも、失敗は黙って白画面にせず復旧導線を出す
  it('チャンク取得に失敗したらエラー表示と再読み込み導線を出す', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <RouteHost>
        <Failing />
      </RouteHost>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('ページの読み込みに失敗しました');
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();

    consoleError.mockRestore();
  });
});
