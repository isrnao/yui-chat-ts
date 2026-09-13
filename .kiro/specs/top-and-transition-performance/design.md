# 技術設計ドキュメント: top-and-transition-performance

## 概要

トップページの初期表示と、トップ → チャット遷移の体感を改善する。狙いは 2 つ。

1. **トップページの critical path を削る** — フォント 480 KB とチャット一式・supabase-js を外す
2. **遷移をフルページ再読み込みからクライアントサイド遷移へ移す** — JS 再パースと React 再起動をなくす

### 設計方針

- **プリレンダ HTML との両立を壊さない。** `scripts/prerender-rooms.ts` が出す `/chat/<id>/index.html`
  は SEO と初回描画の要。クライアントサイド遷移は「2 回目以降の移動」を速くするだけで、直接アクセス時の
  挙動は変えない。
- **先読みは投機。失敗しても遷移を妨げない。** すべて best-effort で、例外は握りつぶす。
- **手動メモ化を増やさない。** React Compiler が有効なので、依存配列に現れるもの以外は追加しない
  （`CLAUDE.md` の方針）。
- **段階的に出す。** 各 Requirement を独立した PR にし、効果を都度ビルド実測で確認する。

## アーキテクチャ

### 現状（before）

```
index.html
  ├ preload font (480 KB)            ← critical path を占有
  ├ modulePreload vendor-react       59.99 kB gz
  ├ modulePreload vendor-supabase    49.59 kB gz  ← トップでは人数取得にしか使わない
  ├ modulePreload vendor-iceberg-js   1.55 kB gz  ← Storage 未使用なのに同梱
  └ script index.js                  46.38 kB gz  ← 全ルートのコードが同居

トップ → チャット: <a href> によるフルドキュメント遷移
  → HTML 再取得 → JS 再パース(raw 526 KB) → React 再起動 → データ取得 → Realtime 接続
```

### 目標（after）

```
index.html
  ├ (font preload なし。unicode-range で必要分だけ遅延取得)
  ├ modulePreload vendor-react
  ├ modulePreload rooms
  ├ modulePreload <該当 Route_Chunk>   ← プリレンダ時に埋め込み、waterfall を消す
  └ script index.js (ルーター本体のみ)

トップ → チャット: Client_Navigator による pushState 遷移
  → Route_Chunk は Room_Prefetcher が先読み済み
  → データも prefetchChatLogs で暖機済み
  → ドキュメント再読み込みなし / JS 再パースなし
```

## コンポーネントとインターフェース

### 1. Font_Subset_Set（Requirement 1）

`src/styles/fonts.css` の単一 `@font-face` を、`unicode-range` 付きの複数宣言に分割する。

分割単位はビルド時にサブセット生成する。おおよその区分:

| サブセット | 範囲                   | 用途                       |
| ---------- | ---------------------- | -------------------------- |
| latin      | `U+0000-00FF` ほか     | 英数字・記号               |
| kana       | `U+3000-30FF`          | ひらがな・カタカナ・句読点 |
| jis1       | 常用漢字を含む主要 CJK | 大半の日本語テキスト       |
| jis2       | 残りの CJK             | 稀な漢字（チャット本文用） |

- `preload` は外す。`font-display: swap` があるため描画は止まらず、preload は 480 KB に高優先度を
  与えて JS と競合していた。
- **合計の文字集合は分割前と一致させる。** チャット本文はユーザー入力なので、サブセット化（文字を
  削る）ではなく分割（必要な範囲だけ落とす）でなければならない。Requirement 1.5 / 1.6 の根拠。

### 2. Route_Chunk と Route_Error_Boundary（Requirement 2）

`App.tsx` の静的 import を `React.lazy` へ置き換え、`Suspense` で包む。

```ts
const TopRoute = lazy(() => import('./routes/TopRoute'));
const ChatRoute = lazy(() => import('./routes/ChatRoute'));
// …
```

- `Suspense` の fallback は **`null` にしない。** ロード失敗時のホワイトスクリーンを避けるため、
  既存の `ErrorBoundary`（`src/shared/components/ErrorBoundary.tsx`）で包み、再試行導線を出す。
  再試行は境界に `key` を与えて remount する方式（`ChatLogPage` で実績のある形）を使う。
- **waterfall 対策。** 動的 import は `index.js` の実行後に始まるため 1 RTT 増える。
  `scripts/prerender-rooms.ts` が各ルームの HTML を生成しているので、同じ仕組みで
  `<link rel="modulePreload">` を該当 Route_Chunk に対して埋め込む。チャンク名はビルド後の
  マニフェストから解決する。

### 3. Room_Counts_Client（Requirement 3）

`roomCountsApi.ts` から `@shared/supabaseClient` の import を外し、PostgREST へ直接 `fetch` する。

```
GET {VITE_SUPABASE_URL}/rest/v1/chats?select=...&deleted=eq.false&time=gte.{since}&order=uuid.desc&limit=...
headers: { apikey, Authorization: `Bearer ${anon}` }
```

- 既存の `isSupabaseConfigured()` によるガードと、失敗時のフォールバック（人数バッジ非表示）は
  そのまま維持する。
- これによりトップの依存グラフから `vendor-supabase` と `vendor-iceberg-js` が外れる。
- チャット側は引き続き supabase-js を使う（Realtime と Edge Functions が必要なため）。

### 4. Client_Navigator（Requirement 4）

`App.tsx` に「内部リンクのクリックを捕捉して `pushState` する」責務を追加する。
`document` に capture 付きで 1 つだけリスナーを張る。

除外条件（既定動作に任せる）:

- 左クリック以外（`event.button !== 0`）
- 修飾キー（`metaKey` / `ctrlKey` / `shiftKey` / `altKey`）
- `event.defaultPrevented`
- アンカーが見つからない、`href` がない
- 別オリジン
- `target` が `_self` 以外
- `download` 属性あり
- ハッシュのみの変更（同一 pathname への `#` リンク）

遷移時の副作用:

- `history.pushState` → 既存の `resolveRouteFollowingRedirects` で state 更新
- `window.scrollTo(0, 0)`（Requirement 4.5）
- シェル配色の更新は既存の `useEffect` が `route` 変化で拾うため追加不要（Requirement 4.6）

`RoomAnchor` の GA 送信（`transport_type: 'beacon'`）は unload を前提にした指定なので、
クライアントサイド遷移では不要になる。挙動を変えないよう、まずは指定を残したまま進める。

### 5. Room_Prefetcher（Requirement 5）

ルームリンクの `onMouseEnter` / `onFocus` / `onTouchStart` を契機に 2 つを先読みする。

1. Route_Chunk: `import('./routes/ChatRoute')`（`React.lazy` と同じモジュール指定にすることで
   ブラウザ / バンドラのモジュールキャッシュを共有する）
2. データ: 既存の `prefetchChatLogs(roomId)`（`chatLogResource` の best-effort 版）

- 実行済み roomId は `Set` で記録し、重複実行しない（Requirement 5.3）
- Network_Heuristics: `navigator.connection?.saveData` または `effectiveType` が `slow-2g` /
  `2g` の場合は何もしない（Requirement 5.4）
- すべて `.catch(() => {})` で握りつぶす（Requirement 5.5）

### 6. チャット初期表示の段階化（Requirement 6）

現状 `loadChatLogs` は `MAX_CHAT_LOG + 1 = 101` 件を取得するが、既定表示は 30 件。

- 初回は表示行数分だけを要求し、描画後に背景で残りを補完する。
- 補完結果は既存の `mergeChatLogByUuid` で統合するため、表示中の発言は失われない。

あわせて、#95 で入れた「接続確立時の取り直し」を**差分クエリ**にする。現状は 100 件の全件取得だが、
取得済みの最新発言以降だけを問い合わせれば通常は 0 行で済む。既存の `loadChatLogsByTimeRange`
（uuid v7 の範囲検索）を使う。境界は取得済み最新発言を**含む**位置に取り、取りこぼしを防ぐ。

### 7. 計測と退行防止（Requirement 7）

- トップページの初期 JS 転送量にバジェットを設け、ビルド成果物を検証するスクリプトを追加する。
- 超過時は非ゼロ終了させ、CI から呼べる形にする。
- 改善前後の実測値を本 spec に記録する（下表）。

## データフロー

### トップ初期表示（after）

```
HTML  →  CSS + index.js(ルーターのみ) + vendor-react + rooms
      →  TopRoute チャンク（modulePreload 済みなら待ちなし）
      →  描画完了
      ↘  フォントは unicode-range で必要分のみ後追い取得（swap）
      ↘  人数は fetch で後追い取得（失敗してもバッジ非表示で描画継続）
```

### トップ → チャット遷移（after）

```
hover  →  Room_Prefetcher: ChatRoute チャンク + prefetchChatLogs
click  →  preventDefault → pushState → setState
       →  Route_Chunk は取得済み → 即描画
       →  chatLogResource がキャッシュ命中 → ログ即表示
       →  Realtime 接続 → 確立時に差分取り直し
```

## エラーハンドリング

| 事象                     | 扱い                                                    |
| ------------------------ | ------------------------------------------------------- |
| Route_Chunk のロード失敗 | Route_Error_Boundary が再試行導線を表示（Req 2.4）      |
| 人数取得の失敗           | バッジ非表示にフォールバック。例外は投げない（Req 3.5） |
| 先読みの失敗             | 握りつぶす。通常遷移に影響させない（Req 5.5）           |
| 低速回線 / saveData      | 先読みを行わない（Req 5.4）                             |

## テスト戦略

### 単体テスト

- Client_Navigator の除外条件（外部リンク / `target="_blank"` / 修飾キー / `download` / 中クリック）
- Client_Navigator が内部リンクで `pushState` し、ドキュメント遷移を起こさないこと
- Room_Prefetcher の一度きり実行、低速回線時の抑制、失敗の握りつぶし
- Room_Counts_Client が supabase-js を使わずに正しい URL / ヘッダで問い合わせること
- Room_Counts_Client の未設定時 / 失敗時フォールバック
- 差分取り直しが取得済み最新以降のみを要求すること

### 統合テスト

- `/` 初期描画で chat feature のモジュールが読まれないこと（依存グラフ検証）
- 内部リンククリックでドキュメント遷移が起きず、チャット画面が描画されること
- 戻る / 進むで正しいルートが描画されること

### ビルド検証

- トップの初期 JS 転送量がバジェット以内であること
- TopRoute / ChatRoute が別チャンクとして出力されること
- `/` の依存グラフに `vendor-supabase` / `vendor-iceberg-js` が含まれないこと

## 実測値の記録

| 指標                   | before          | after（目標） | 実測 |
| ---------------------- | --------------- | ------------- | ---- |
| トップ 初期 JS         | 157.6 kB gz     | 85 kB gz 以下 | TBD  |
| トップ フォント転送    | 480 KB          | 200 KB 以下   | TBD  |
| `/` の vendor-supabase | 取得する        | 取得しない    | TBD  |
| 遷移時の JS 再パース   | 毎回 raw 526 KB | なし          | TBD  |
