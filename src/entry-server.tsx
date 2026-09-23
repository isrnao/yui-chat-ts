import { StrictMode, type ReactNode } from 'react';
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
export function render(pathname: string): Promise<string> {
  return renderToHtml(
    <StrictMode>
      <App initialPathname={pathname} />
    </StrictMode>
  );
}

/**
 * 要素を HTML にする。描画中にエラーが 1 件でも出たら失敗させる（テスト用に export）。
 *
 * prerenderToNodeStream は、Suspense の中で起きたエラー（ルートのチャンクの読み込み失敗など）では
 * 失敗せず、その境界を「クライアントで描き直す」印にした HTML を返す。そのままだと中身のない
 * ページが公開されてもビルドが通ってしまうので、onError で集めて失敗にする
 * （以前の renderToPipeableStream 版も onError で reject していた）。
 */
export async function renderToHtml(node: ReactNode): Promise<string> {
  const errors: unknown[] = [];
  const { prelude } = await prerenderToNodeStream(node, {
    onError(error) {
      errors.push(error);
    },
  });
  const html = await text(prelude);
  if (errors.length > 0) {
    const [first] = errors;
    throw first instanceof Error ? first : new Error(String(first));
  }
  return html;
}
