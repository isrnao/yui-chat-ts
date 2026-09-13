import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';
import App from './App';
import { preloadRoute } from './routes/routeLoaders';
import { recordVisitOncePerSession } from '@features/chat/utils/settingsStore';

// React ライフサイクルの影響を受けない位置で1回だけ呼び出す
recordVisitOncePerSession();

const root = createRoot(document.getElementById('root')!);

// ルートチャンクを解決してから描画する。未解決のまま描画すると Suspense の
// fallback が一瞬挟まるため (分割前は同居していて即描画だった)。
// チャンクはプリレンダ HTML の modulePreload で並行取得済み。
void preloadRoute(window.location.pathname).then(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});

// フォントのフォールバックサブセット (ユーザー入力の任意の日本語用、123 分割) は
// CSS が render-blocking なため初回描画後に読み込む。同梱すると CSS 自体が
// 34kB gz 太り、フォント削減分を打ち消してしまう。
// 未ロードの間に稀な文字が現れてもフォールバック表示になるだけで、
// font-display: swap の既定挙動と変わらない。
function loadFallbackFontSubsets(): void {
  void import('./styles/fonts-fallback.css');
}

if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(loadFallbackFontSubsets);
} else {
  setTimeout(loadFallbackFontSubsets, 0);
}
