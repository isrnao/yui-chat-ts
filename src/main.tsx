import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import './App.css';
import App from './App';
import { preloadRoute } from './routes/routeLoaders';
import { recordVisitOncePerSession } from '@features/chat/utils/settingsStore';

// React ライフサイクルの影響を受けない位置で1回だけ呼び出す
recordVisitOncePerSession();

const container = document.getElementById('root')!;

// SSG 済みのページ (prerender が data-ssg="1" を付ける) は hydrate する。
// createRoot だと SSG した内容を捨てて描き直すため、せっかく HTML に入っている
// 初期描画が一度消えてしまう。印が無いページ (dev サーバー等) は従来どおり createRoot。
const isSsg = container.dataset.ssg === '1';

function renderApp(): void {
  const tree = (
    <StrictMode>
      <App />
    </StrictMode>
  );
  if (isSsg) {
    hydrateRoot(container, tree);
  } else {
    createRoot(container).render(tree);
  }
}

// lazy ルート (チャット系) はチャンクの解決を待ってから描画する。
// SSG 済みの HTML が既に表示されているので、待っている間もユーザーには
// 完成した画面が見えている。未解決のまま hydrate すると Suspense の境界が
// SSG 済みの内容を捨ててしまう。
//
// トップは静的 import なので preloadRoute が null を返し、同期で即描画する。
// 取得に失敗しても preloadRoute は解決するので、描画後に RouteHost の
// ErrorBoundary が復旧導線を出す。
const pendingRoute = preloadRoute(window.location.pathname);
if (pendingRoute) {
  void pendingRoute.then(renderApp);
} else {
  renderApp();
}

// フォントのフォールバックサブセット (ユーザー入力の任意の日本語用、123 分割) は
// CSS が render-blocking なため初回描画後に読み込む。同梱すると CSS 自体が
// 34kB gz 太り、フォント削減分を打ち消してしまう。
// 未ロードの間に稀な文字が現れてもフォールバック表示になるだけで、
// font-display: swap の既定挙動と変わらない。
function loadFallbackFontSubsets(): void {
  // 失敗してもシステムフォントで継続できる任意のリソースなので明示的に握り潰す。
  // void だけでは rejection が未処理のまま残る。
  void import('./styles/fonts-fallback.css').catch(() => {});
}

// New Relic Browser 監視も初回描画を妨げないようアイドル時に読み込む（未設定なら何もしない）。
// 読み込み前の操作は記録されないが、入室してから送信するまでの時間があるため許容する。
function loadDeferredResources(): void {
  loadFallbackFontSubsets();
  void import('@shared/observability/newRelic').then(({ initNewRelicBrowser }) =>
    initNewRelicBrowser()
  );
}

if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(loadDeferredResources);
} else {
  setTimeout(loadDeferredResources, 0);
}
