import { StrictMode } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { text } from 'node:stream/consumers';
import App from './App';

/**
 * SSG 用のレンダラ。ビルド後に scripts/prerender-rooms.ts から呼ばれ、
 * 生成した HTML を dist の各ページの #root に埋める。
 *
 * react-dom/static の prerenderToNodeStream は SSG 専用の API で、すべての Suspense 境界が
 * 解決するまで待ってから HTML を返す。チャット系ルートは React.lazy で分割されているので、
 * 待たないと中身ではなく Suspense の fallback が出力されてしまう。
 * 以前は renderToPipeableStream の onAllReady と Writable で同じことを組み立てていた
 * （.kiro/specs/react-2026-refactoring Requirement 15）。
 */
export async function render(pathname: string): Promise<string> {
  const { prelude } = await prerenderToNodeStream(
    <StrictMode>
      <App initialPathname={pathname} />
    </StrictMode>
  );
  return text(prelude);
}
