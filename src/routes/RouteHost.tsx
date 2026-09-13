import { Suspense, type ReactNode } from 'react';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';

/**
 * lazy ルートの読み込み中 / 失敗を扱うホスト。
 *
 * - ルート単位で code splitting しているため、チャンクの取得に失敗しうる
 *   (デプロイでハッシュが変わった直後の古いタブなど)。素の Suspense だけだと
 *   その場合にホワイトスクリーンになる。
 * - 再試行はページの再読み込みで行う。React.lazy は失敗した promise を保持し続けるので
 *   同じ lazy 参照を再レンダーしても再取得されない。またチャンク取得の失敗は
 *   「配信側のファイルが入れ替わった」ケースが多く、再読み込みが最も確実に復旧する。
 */
export function RouteHost({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4 font-yui">
          <p role="alert" className="text-sm text-red-600">
            ページの読み込みに失敗しました。
          </p>
          <button
            type="button"
            className="border-2 border-ie-gray bg-ie-face px-3 py-1 text-sm [border-style:outset]"
            onClick={() => window.location.reload()}
          >
            再読み込み
          </button>
        </div>
      }
    >
      {/*
        fallback を null にしない: 読み込みが遅い回線で「何も無い画面」になるのを避ける。
        高さを確保しないことで、描画後のレイアウトシフトも起こさない。
      */}
      <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>{children}</Suspense>
    </ErrorBoundary>
  );
}
