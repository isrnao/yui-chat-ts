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

function onIdle(callback: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(callback);
  } else {
    setTimeout(callback, 0);
  }
}

onIdle(loadFallbackFontSubsets);

// New Relic Browser 監視は、最初の操作（pointerdown / keydown / touchstart）か load の 10 秒後の
// どちらか早いほうで、アイドル時に読み込む（未設定なら何もしない）。
// 最初のアイドル時や load 直後に読むと、LCP の前にエージェント（gzip 50KB）がフォントの
// サブセットと回線を取り合い、Lighthouse（モバイル）で LCP が約 0.9 秒遅れた。
// 発言するには名前の入力などの操作が先に必要なので、送信の時点では読み込みが終わっている。
// Web Vitals（LCP など）は読み込みが遅れても取得できる。
const NEW_RELIC_FALLBACK_DELAY_MS = 10_000;
const FIRST_INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

function loadNewRelic(): void {
  // チャンクの取得に失敗しても（デプロイ前から開いていたタブで古いチャンクが消えた場合など）
  // 監視は任意の機能なので握り潰す。void だけでは rejection が未処理のまま残る。
  import('@shared/observability/newRelic')
    .then(({ initNewRelicBrowser }) => initNewRelicBrowser())
    .catch(() => {});
}

function scheduleNewRelic(): void {
  let scheduled = false;
  const listenerOptions = { capture: true, passive: true } as const;
  const trigger = () => {
    if (scheduled) return;
    scheduled = true;
    clearTimeout(timer);
    for (const type of FIRST_INTERACTION_EVENTS) {
      window.removeEventListener(type, trigger, listenerOptions);
    }
    onIdle(loadNewRelic);
  };
  for (const type of FIRST_INTERACTION_EVENTS) {
    window.addEventListener(type, trigger, listenerOptions);
  }
  const timer = setTimeout(trigger, NEW_RELIC_FALLBACK_DELAY_MS);
}

if (document.readyState === 'complete') {
  scheduleNewRelic();
} else {
  window.addEventListener('load', scheduleNewRelic, { once: true });
}
