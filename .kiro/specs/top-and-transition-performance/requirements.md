# Requirements Document: top-and-transition-performance

## Introduction

トップページの初期表示と、トップ → チャットの遷移体感を改善する。既存 spec
[`spa-performance-optimization`](../spa-performance-optimization/requirements.md) の後継として、
現行コード（React 19.2 / React Compiler 有効 / Vite 8 + rolldown）を前提に再設計する。

### Lighthouse ベースライン（本番 https://www.okiraku.chat/ ・mobile・simulate）

| 指標                         | 値               |
| ---------------------------- | ---------------- |
| Performance                  | **66**           |
| First Contentful Paint       | 3.7 s            |
| **Largest Contentful Paint** | **8.9 s**        |
| Total Blocking Time          | **10 ms**        |
| Cumulative Layout Shift      | 0                |
| Speed Index                  | 4.5 s            |
| 総リクエスト / 転送量        | 24 req / 1005 KB |

**TBT が 10 ms しかない点が重要。** JS の実行は速く、ボトルネックは実行ではなく
「描画に必要なものが揃うまでの時間」にある。

LCP 要素はトップの紹介文 `<p class="mt-1 leading-relaxed">` で、内訳は
**TTFB 1241 ms (14%) / Render Delay 7644 ms (86%)**。つまり描画開始まで 7.6 秒待っている。

原因は **全ページがクライアント描画で、HTML の `#root` が空**であること。
`scripts/prerender-rooms.ts` は meta タグを書き換えるだけで本文を埋めていないため、
トップも部屋ページも JS が到着・実行されるまで一文字も描画されない。

転送量の内訳（実測）:

| 分類               | 転送量     | 内訳                                                   |
| ------------------ | ---------- | ------------------------------------------------------ |
| フォント           | 480 KB     | 単一 woff2                                             |
| **サードパーティ** | **318 KB** | Google Tag Manager 172.7 / Twitter 135.1 / ar-cdn 16.5 |
| アプリ JS          | 142.6 KB   | vendor-react 58.5 / vendor-supabase 48.9 / index 35.2  |
| その他             | 約 64 KB   | 画像・CSS ほか                                         |

### 計測した現状（本番ビルド実測）

トップページが取得する総バイトは約 646 KB。**うちフォントが 480 KB（74%）を占める。**

| 資産                | 転送量          | 備考                                                   |
| ------------------- | --------------- | ------------------------------------------------------ |
| DotGothic16 woff2   | 480 KB          | `<link rel=preload>` 付き。JIS 第1+第2水準フルセット   |
| vendor-react        | 59.99 kB gz     |                                                        |
| index（アプリ全体） | 46.38 kB gz     | チャット / ちゃなりのコードも同一チャンクに同居        |
| vendor-supabase     | 49.59 kB gz     | トップは参加人数取得にしか使わない                     |
| vendor-iceberg-js   | 1.55 kB gz      | `@supabase/storage-js` 経由。本アプリは Storage 未使用 |
| CSS                 | 8.91 kB gz      |                                                        |
| **JS 合計**         | **157.6 kB gz** | raw 約 526 KB                                          |

### 特定したボトルネック

1. **ルート分割が効いていない。** `App.tsx` が `TopRoute` / `ChatRoute` / `AllRoomsRoute` /
   `ChanariRoute` / `NotFoundRoute` をすべて静的 import している。旧 spec の Task 1 は `[x]`
   だが、成果物（`LazyRouteHost` / `RouteErrorBoundary` / lazy ルート）は現行 main に存在しない。
2. **トップが supabase-js 一式を初期経路に載せている。** `TopPage → useRoomCounts →
roomCountsApi → @shared/supabaseClient` の連鎖。実際に使うのは PostgREST への 1 クエリのみ。
3. **遷移がフルページ再読み込み。** `RoomAnchor` は素の `<a href>` で、クリック捕捉も
   `pushState` もない（`App.tsx` は `popstate` のみ購読）。JS がキャッシュに載っていても
   raw 約 526 KB の再パースと React 再起動が毎回走る。
4. **フォントが critical path を占有。** `font-display: swap` で描画は止まらないが、
   `<link rel=preload as=font>` が 480 KB に高優先度を与え、JS の帯域を奪う。
5. **チャット初期取得が過剰。** `loadChatLogs` は 101 件取得するが、既定表示は 30 件。

### 実測した分割効果

ルート lazy 化 + トップから supabase 依存を外した状態でビルドし、トップの JS が
**157.6 kB gz → 83.4 kB gz（−47%）** になることを確認済み。

## Glossary

- **Route_Chunk**: ルートごとに分割された動的 import チャンク（TopRoute / ChatRoute / ChanariRoute / AllRoomsRoute / NotFoundRoute）
- **Route_Error_Boundary**: Route_Chunk のロード失敗と render error を捕捉し、再試行導線を出す ErrorBoundary
- **Client_Navigator**: 内部リンクのクリックを捕捉し `history.pushState` でルートを切り替える仕組み。`popstate` 購読と対で動く
- **Room_Prefetcher**: ルームリンクの hover / focus / touchstart と idle を契機に、Route_Chunk と `prefetchChatLogs` を先読みするユーティリティ
- **Font_Subset_Set**: `unicode-range` で分割した複数の `@font-face` 宣言群。ブラウザが実際に描画に必要な範囲だけを取得する
- **Room_Counts_Client**: supabase-js を介さず PostgREST へ直接 `fetch` する参加人数取得クライアント
- **Network_Heuristics**: `navigator.connection` を読み、低速回線 / データセーバー時に先読みを抑制する判定

## Requirements

### Requirement 1: フォント配信の最適化

**User Story:** トップページ訪問者として、テキストが読めるまでの時間を短くしたい。480 KB のフォントが JS と帯域を奪っている状態を解消するため。

#### Acceptance Criteria

1. THE `index.html` SHALL UI テキスト用サブセット以外のフォントを preload しない。
   1a. THE `index.html` SHALL UI テキスト用サブセットを preload する。preload しないと
   swap のタイミングで文字幅が変わりレイアウトシフトになるため（実測で CLS 0.023 → 0）。
2. THE Font_Subset_Set SHALL `unicode-range` を指定した複数の `@font-face` で構成される。
3. WHEN ブラウザがトップページを描画する, THE ブラウザ SHALL 描画に必要な `unicode-range` を含むサブセットのみを取得する。
4. THE Font_Subset_Set SHALL `font-display: swap` を維持する。
5. THE Font_Subset_Set SHALL 分割前と同じ文字集合（JIS 第1・第2水準 + Latin + かな）を合計として網羅する。
6. WHEN チャット本文にユーザー入力の任意の日本語が含まれる, THE ブラウザ SHALL 該当文字を含むサブセットを追加取得して正しく描画する。

### Requirement 2: ルート単位の Code Splitting

**User Story:** トップページのみを見る訪問者として、チャット機能のコードをダウンロードしたくない。初期表示を速くするため。

#### Acceptance Criteria

1. THE `App.tsx` SHALL チャット系ルート（chat / chanari / all-rooms / not-found）を
   `React.lazy` 経由でのみ参照する。
   1a. THE `App.tsx` SHALL トップページのルートを静的 import する。lazy にすると
   「チャンク到着まで何も描画できない」時間が必ず入り、体感の初期描画が分割前より
   悪化するため（軽量サイトでは分割の旨味より待ちの害が大きい）。
2. WHEN ビルドが完了する, THE ビルド成果物 SHALL ChatRoute / ChanariRoute / AllRoomsRoute を別チャンクとして出力する（TopRoute は 1a により静的依存なのでエントリに含まれる）。
3. WHEN ユーザーが `/` を訪問する, THE ブラウザ SHALL chat feature のコードを初期ロードで取得しない。
4. WHEN Route_Chunk のロードに失敗する, THE Route_Error_Boundary SHALL 再試行導線を表示し、ホワイトスクリーンにしない。
   4a. THE Route_Chunk の待機中 SHALL 全画面の読み込み表示を出さない。出せるものから順に
   描画するほうが体感が良く、読み込み表示を一枚挟むと初期描画の体感が悪化するため。
5. WHEN ユーザーがプリレンダ済みの `/chat/<id>` に直接アクセスする, THE HTML SHALL 該当 Route_Chunk への `modulePreload` ヒントを含み、動的 import による追加ラウンドトリップを発生させない。
6. THE 既存のリダイレクト仕様（`/chat` → `/chat/<default>`）SHALL 維持される。

### Requirement 3: トップページからの supabase-js 排除

**User Story:** トップページ訪問者として、参加人数バッジのためだけに 50 kB のライブラリを読みたくない。

#### Acceptance Criteria

1. THE Room_Counts_Client SHALL `@supabase/supabase-js` を import しない。
2. THE Room_Counts_Client SHALL PostgREST エンドポイントへ `fetch` で問い合わせ、`apikey` と `Authorization` ヘッダを付与する。
3. WHEN Supabase の環境変数が未設定である, THE Room_Counts_Client SHALL 通信を行わず空の結果を返す既存挙動を維持する。
4. WHEN ユーザーが `/` を訪問する, THE ブラウザ SHALL `vendor-supabase` チャンクおよび `vendor-iceberg-js` チャンクを取得しない。
5. THE Room_Counts_Client SHALL 取得失敗時に例外を投げず、人数バッジ非表示にフォールバックする既存挙動を維持する。

### Requirement 4: クライアントサイド遷移

**User Story:** トップからチャットへ移動するユーザーとして、待たされたくない。毎回のフルページ再読み込みをやめるため。

#### Acceptance Criteria

1. WHEN ユーザーが同一オリジンの内部リンクを修飾キーなしの左クリックで開く, THE Client_Navigator SHALL `event.preventDefault()` し `history.pushState` でルートを切り替える。
2. WHEN リンクが外部オリジン、`target="_blank"`、`download` 属性、修飾キー付きクリック、または左クリック以外である, THE Client_Navigator SHALL 既定のブラウザ動作を妨げない。
3. WHEN ルートが切り替わる, THE ブラウザ SHALL ドキュメントを再読み込みせず、JS の再パースと React の再起動を行わない。
4. WHEN ユーザーがブラウザの戻る / 進むを操作する, THE App SHALL 既存の `popstate` 購読で正しいルートを描画する。
5. WHEN ルートが切り替わる, THE App SHALL スクロール位置を新しいルートの先頭にリセットする。
6. WHEN ルートが切り替わる, THE App SHALL 既存のシェル配色（背景色 / `theme-color`）更新を維持する。
7. WHEN ユーザーがプリレンダ済み URL に直接アクセスする, THE HTML SHALL 従来どおり静的コンテンツを返し、SEO 上の挙動を変えない。

### Requirement 5: ルートとデータの先読み

**User Story:** ルームリンクを見ているユーザーとして、クリックした瞬間にチャットが表示されてほしい。

#### Acceptance Criteria

1. WHEN ユーザーがルームリンクに hover / focus / touchstart する, THE Room_Prefetcher SHALL 対応する Route_Chunk の動的 import を開始する。
2. WHEN ユーザーがルームリンクに hover / focus / touchstart する, THE Room_Prefetcher SHALL `prefetchChatLogs(roomId)` を呼ぶ。
3. THE Room_Prefetcher SHALL 同一 roomId に対する先読みを一度だけ実行する。
4. WHEN Network_Heuristics が低速回線または `saveData` を検出する, THE Room_Prefetcher SHALL 先読みを行わない。
5. WHEN 先読みが失敗する, THE Room_Prefetcher SHALL 例外を伝播せず、通常の遷移を妨げない。

### Requirement 6: チャット初期表示の段階化

**User Story:** チャットに入ったユーザーとして、ログが出るまで待たされたくない。

#### Acceptance Criteria

1. WHEN チャットルートが初期取得を行う, THE 取得 SHALL 初回に表示行数分のみを要求し、残りを背景で補完する。
2. WHEN 背景の補完が完了する, THE ログ SHALL 既存の uuid マージ規則で統合され、表示中の発言を失わない。
3. WHEN Realtime の接続が確立して取り直しが走る, THE 取り直し SHALL 取得済みの最新発言以降のみを要求する差分クエリである。
4. THE 差分取り直し SHALL 取得漏れがないよう、取得済み最新発言を含む境界で問い合わせる。

### Requirement 8: 静的 HTML への初期描画内容の埋め込み

**User Story:** 訪問者として、JS の到着を待たずに本文を読み始めたい。LCP 8.9 秒の 86% を占める Render Delay を解消するため。

#### Acceptance Criteria

1. WHEN ビルドが完了する, THE トップページの HTML SHALL `#root` 内に初期描画内容を含む。
2. WHEN ブラウザが HTML を受信する, THE ブラウザ SHALL JS の実行を待たずに LCP 要素を描画できる。
3. THE 埋め込み内容 SHALL クライアント描画後の内容と視覚的に一致し、置換時にレイアウトシフトを起こさない。
4. THE 既存の meta / OGP / JSON-LD の生成 SHALL 維持される。
5. WHEN JS が無効である, THE トップページ SHALL 埋め込まれた内容を表示する。

### Requirement 9: サードパーティスクリプトの遅延化

**User Story:** 訪問者として、計測タグや埋め込みウィジェットのために本文の表示を待ちたくない。

#### Acceptance Criteria

1. THE Google Tag Manager スクリプト SHALL 初回描画の完了後に読み込まれる。
2. THE X（Twitter）タイムライン埋め込み SHALL ビューポートに入るまで読み込まれない。
3. THE 広告ウィジェット SHALL ビューポートに入るまで読み込まれない。
4. WHEN サードパーティの読み込みが失敗する, THE ページ SHALL 本文の表示と操作を継続できる。
5. THE 計測イベントの送信 SHALL 遅延読み込み後も従来どおり機能する。

### Requirement 7: 計測と退行防止

**User Story:** 開発者として、改善が数値で確認でき、将来の退行に気づけるようにしたい。

#### Acceptance Criteria

1. THE リポジトリ SHALL トップページの初期 JS 転送量の上限値（バジェット）を定義する。
2. WHEN ビルド成果物がバジェットを超える, THE 検証コマンド SHALL 非ゼロ終了する。
3. THE リポジトリ SHALL 改善前後の実測値（転送量・チャンク構成）を記録する。
4. THE リポジトリ SHALL Lighthouse の実測値（Performance / FCP / LCP / TBT）を改善前後で記録する。
