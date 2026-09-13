import { StrictMode } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { Writable } from 'node:stream';
import App from './App';

/**
 * SSG 用のレンダラ。ビルド後に scripts/prerender-rooms.ts から呼ばれ、
 * 生成した HTML を dist の各ページの #root に埋める。
 *
 * renderToString ではなく renderToPipeableStream を使う理由:
 * チャット系ルートは React.lazy で分割されており、renderToString では
 * 中身ではなく Suspense の fallback が出力されてしまう。
 * renderToPipeableStream は onAllReady で全 Suspense 境界の解決を待てる。
 */
export function render(pathname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Buffer は Node 専用グローバルで eslint の no-undef に当たるため使わない。
    // マルチバイト文字がチャンク境界で割れないよう stream モードでデコードする。
    const decoder = new TextDecoder();
    let html = '';
    let settled = false;

    const { pipe, abort } = renderToPipeableStream(
      <StrictMode>
        <App initialPathname={pathname} />
      </StrictMode>,
      {
        onAllReady() {
          pipe(
            new Writable({
              write(chunk: Uint8Array, _encoding, callback) {
                html += decoder.decode(chunk, { stream: true });
                callback();
              },
              final(callback) {
                html += decoder.decode();
                settled = true;
                resolve(html);
                callback();
              },
            })
          );
        },
        onError(error) {
          if (settled) return;
          settled = true;
          abort();
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      }
    );
  });
}
