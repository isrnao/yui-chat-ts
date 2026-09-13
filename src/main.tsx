import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';
import App from './App';
import { preloadRoute } from './routes/routeLoaders';
import { recordVisitOncePerSession } from '@features/chat/utils/settingsStore';

// React ライフサイクルの影響を受けない位置で1回だけ呼び出す
recordVisitOncePerSession();

const root = createRoot(document.getElementById('root')!);

function renderApp(): void {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// lazy ルート (チャット系) はチャンクの解決を待ってから描画する。
// 部屋ページの HTML には #root にプリレンダ済みの本文が入っているため、
// 待っている間はそれが表示されたままになり、空白を挟まずに実 UI へ切り替わる。
// 先に描画してしまうと createRoot がプリレンダ本文を消し、チャンクが届くまで
// 何も無い画面になる。
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

if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(loadFallbackFontSubsets);
} else {
  setTimeout(loadFallbackFontSubsets, 0);
}
