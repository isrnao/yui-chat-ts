# 調査メモ: 2026 年の React 技術動向と設計思想

調査日: 2026-09-23。本 spec（[requirements.md](./requirements.md)）の前提となる外部動向をまとめる。
コードベース側の調査結果は requirements.md の Introduction に書く。

## 1. リリースの時系列

| 日付       | 出来事                            | 要点                                                                                                                                                   |
| ---------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2025-10-01 | React 19.2                        | `<Activity>`、`useEffectEvent`、`cacheSignal`（RSC）、DevTools の Performance Tracks、Partial Pre-rendering（`prerender` → `resume`）                  |
| 2025-10-07 | React Compiler 1.0                | 初の安定版。コンパイラ由来の lint ルールが `eslint-plugin-react-hooks` の recommended に入った。Vite / Next.js / Expo のテンプレートが既定で有効化     |
| 2025-10-07 | React Foundation 発表             | 2026-02-24 に Linux Foundation 傘下で正式発足。ガバナンスが Meta 単独から財団へ移った                                                                  |
| 2025-12    | RSC のセキュリティ勧告（2 件）    | 認証なし RCE（19.0.1 / 19.1.2 / 19.2.1 で修正）と、DoS・ソース露出。**RSC を使うアプリのみ対象**                                                       |
| 2026-09-09 | React 19.3（最新 `react@19.3.0`） | `<ViewTransition>` と Fragment Refs が安定版に。`addTransitionType`、`react-dom` の `browser()`、Trusted Types 対応、RSC で `<Context>` を直接描画可能 |

React 19.3 の修正のうち、本アプリに関係するもの:

- `useDeferredValue` が古い値で止まる不具合の修正（#36134）。`useParticipants` が `useDeferredValue` を使っている
- `useEffectEvent` が `memo` / `forwardRef` のコンポーネント内で古い値を読む不具合の修正（#34831）
- 非表示の `<Activity>` の中で `useSyncExternalStore` がストアの変更を見落とす不具合の修正（#36947）
- Mobile Safari で `<ViewTransition>` がクラッシュする不具合の修正（#35337 / #35520）
- `resize` イベント由来の更新をフレーム単位でまとめる（#35117）

## 2. 設計思想の要点

### 2.1 コンパイラ前提で書く（Compiler-first）

- メモ化はコンパイラの仕事。`useMemo` / `useCallback` / `memo` を書くのは、**Effect の依存配列に入る同一性**など、意味のある理由があるときだけにする
- 既存コードの手動メモ化は一度に全部消さず、効果を測りながら少しずつ外す（公式の移行ガイドの方針）
- その前提として、コンパイラが**実際にコンパイルしているか**を確かめる必要がある。コンパイラは既定では失敗を黙って飛ばす（`panicThreshold: 'none'`）
- **既知の落とし穴:** `babel-plugin-react-compiler@1.0.0` を `@babel/core` 8 で動かすと、分割代入のデフォルト値（`({ a = 1 })`）を含む関数をすべてコンパイルできない。Babel 8 で `AssignmentPattern` が `LVal` から外れたのが原因（[react/react#36868](https://github.com/react/react/issues/36868)）。修正 PR（[#37492](https://github.com/react/react/pull/37492)）は 2026-09-23 時点で未マージで、当面の回避策は `@babel/core` を 7 系に固定すること
- 安全弁は `'use no memo'` ディレクティブ。参照の同一性に依存するライブラリとの境界などで使う

### 2.2 Async React: Actions + useOptimistic + Suspense + Transitions

React Conf 2025 で Ricky Hanlon が示した設計。新しいライブラリではなく、React 18 / 19 の非同期プリミティブを組み合わせる考え方。

- **Action** = Transition の中で実行する非同期関数。`<form action>`、`useActionState`、`startTransition(async () => …)` で作る
- **`useOptimistic` の楽観的な値は、それを包む Action が pending の間だけ残る。** 同期の `startTransition(() => addOptimistic(x))` は即座に終わるため、楽観的な値もすぐ消える。非同期処理は**同じ Transition の中で** await する
- Action の中で別の Transition を始めると、React はそれを進行中の Action に束ねる（entangle）。そのため「呼び出し元が偶然 Action の中にいたから動いている」コードが生まれやすい
- フォームは `<form action={fn}>` と `useActionState` / `useFormStatus` を使うのが標準形。成功すると、非制御の入力欄は React が自動でリセットする
- 読み込みは Suspense、遅延表示は `useDeferredValue`、UI の切り替えは Transition で扱う

### 2.3 Effect は逃げ道

[You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) の方針が lint で強制されるようになった（`set-state-in-effect`、`purity`、`refs` など）。

- 派生値はレンダー中に計算する。**レンダーは純粋でなければならない**（`Date.now()` / `Math.random()` をレンダー中に呼ばない。コンパイラのメモ化で値が固定されるため、時刻は外から渡す）
- ユーザー操作への反応はイベントハンドラに書く
- 外部の状態（localStorage、WebSocket、ブラウザ API）は `useSyncExternalStore` で読む
- Effect から呼ぶが依存にしたくない処理は `useEffectEvent` にする
- 状態のリセットは `key` で行う

### 2.4 表示状態とアニメーションを React が扱う

- `<Activity mode="hidden">`: DOM と状態を残したまま隠す。隠れている間は Effect が止まり、更新は低優先度になる。タブ切り替えで状態を保持したり、次に開く画面を裏で描画したりするのに使う
- `<ViewTransition>`: Transition でマークした更新（`startTransition`、Suspense の表示、`useDeferredValue`）にだけアニメーションを付ける。Realtime 受信のような緊急の更新はアニメーションしない
- Fragment Refs: ラッパー要素を足さずに、複数の子 DOM へ IntersectionObserver やフォーカスを当てられる

### 2.5 Web プラットフォームに寄せる

- View Transitions API: 同一ドキュメント内は Baseline（Firefox 144 以降）。**ドキュメント間**（`@view-transition { navigation: auto; }`）は Chromium 126 以降と Safari 18.2 以降で動き、Firefox は未対応
- Speculation Rules API（リンク先の prefetch / prerender）は Chromium のみ。非対応のブラウザでは何も起きないので、段階的な強化として使える
- Trusted Types（React 19.3 で対応）

### 2.6 描画方式

- SSG は `react-dom/static` の `prerender` / `prerenderToNodeStream` を使う。すべての Suspense が解決するまで待ってから HTML を返す、SSG 専用の API
- Partial Pre-rendering: 静的なシェルを CDN から配り、動的な部分を `resume` で続きから描画する
- RSC はサーバー（またはフレームワーク）が前提。静的ホスティングのアプリで採る理由は薄い

### 2.7 ツールチェーン（2026-09 時点の最新）

| ツール                | 最新    | 本リポジトリ | 備考                                                                                                                                |
| --------------------- | ------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| react / react-dom     | 19.3.0  | 19.2.6       |                                                                                                                                     |
| vite                  | 8.3.0   | 8.0.13       | `build.rollupOptions` → `build.rolldownOptions`、関数形式の `manualChunks` は非推奨（→ `codeSplitting`）。JS の minify は既定で Oxc |
| vitest                | 5.0.1   | 3.2.4        | Vite 8 上で `esbuild` オプションの非推奨警告が出ている                                                                              |
| @supabase/supabase-js | 2.117.0 | 2.105.4      | 2026-06-30 に Node.js 20 のサポートを終了                                                                                           |
| @babel/core           | 8.x     | 8.0.1        | React Compiler 1.0 とは非互換（§2.1）。7 系の最新は 7.29.7                                                                          |

型情報を使う lint（typescript-eslint の `no-floating-promises` / `no-misused-promises`）が、Actions で増えた async ハンドラの取りこぼしを防ぐ手段として定着している。

### 2.8 データ層

- よく使われる構成は「TanStack Query をキャッシュの本体にし、Supabase Realtime で `invalidateQueries` する」
- 扱うリソースが 1 種類で、Realtime での push が中心の小さなアプリなら、`useSyncExternalStore` で読む自前の外部ストアで足りる。依存と初期 JS が増えない

## 3. 本プロジェクトへの当てはめ

| 動向                                                | 現状                                                                              | 判断                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Compiler-first                                      | 有効化済みだが、Babel 8 のため 73 関数中 18 が未コンパイル                        | **最優先で直す**（R1）                                                  |
| Async React / Actions                               | `useOptimistic` と `useActionState` を使っているが、Action の境界が呼び出し元任せ | 楽観的更新を送信側で完結させる（R2）。フォームを Actions に揃える（R8） |
| レンダーの純粋性                                    | `getRecentParticipants` がレンダー中に `Date.now()` を呼ぶ                        | 時刻を引数にする（R3）                                                  |
| 外部ストア + uSES                                   | settingsStore は uSES。ちゃなりの下書きとチャットログは Effect で同期             | ストアへ寄せる（R6 / R9）                                               |
| Activity / ViewTransition                           | 未使用。ランキング表示に切り替えるとログ一覧がアンマウントされる                  | 19.3 に上げて適用する（R12）                                            |
| ドキュメント間 View Transitions / Speculation Rules | 画面遷移はすべて全ページ読み込み（`pushState` なし）                              | クライアントルーティングと比べて決める（R16）                           |
| SSG API                                             | `renderToPipeableStream` + `onAllReady`                                           | `prerenderToNodeStream` に置き換える（R15）                             |
| 型付き lint                                         | 型情報を使うルールなし。試験的に有効化すると Promise 関連の違反が 17 件           | 導入する（R11）                                                         |
| RSC / フレームワーク                                | GitHub Pages の静的配信、サーバーなし                                             | 採らない（Non-Goals）                                                   |
| TanStack Query 等                                   | 自前の chatLogResource（TTL キャッシュ、in-flight dedupe）                        | 採らない。自前のストアを簡素化する（R6）                                |

## 参考資料

- [React 19.3 – React Blog](https://react.dev/blog/2026/09/09/react-19-3)
- [React 19.2 – React Blog](https://react.dev/blog/2025/10/01/react-19-2)
- [React Blog（一覧）](https://react.dev/blog)
- [React Conf 2025 Recap](https://react.dev/blog/2025/10/16/react-conf-2025-recap)
- ['use memo' directive – React](https://react.dev/reference/react-compiler/directives/use-memo)
- [You Might Not Need an Effect – React](https://react.dev/learn/you-might-not-need-an-effect)
- [prerenderToNodeStream – React](https://react.dev/reference/react-dom/static/prerenderToNodeStream)
- [react/react#36868: React compiler not working with babel 8](https://github.com/react/react/issues/36868)
- [react/react#37492: Support destructured defaults under Babel 8](https://github.com/react/react/pull/37492)
- [Vite 8 Migration Guide](https://vite.dev/guide/migration)
- [Vite 8.0 is out!](https://vite.dev/blog/announcing-vite8)
- [Speculation Rules API – MDN](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API)
- [Same-document view transitions are Baseline – web.dev](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)
- [Cross-Document View Transitions: The Gotchas – CSS-Tricks](https://css-tricks.com/cross-document-view-transitions-part-1/)
- [The next era of React – LogRocket](https://blog.logrocket.com/the-next-era-of-react/)
- [How to Use Supabase with TanStack Query – MakerKit](https://makerkit.dev/blog/saas/supabase-react-query)
