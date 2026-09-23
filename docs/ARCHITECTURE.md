# ゆいちゃっとTS 技術設計ドキュメント

## 1. プロジェクト概要

ゆいちゃっとTSは「放課後学生タウン」の雰囲気を再現した、ブラウザベースのリアルタイムチャットアプリケーションです。React + TypeScriptで構築し、バックエンドにSupabase（PostgreSQL + Realtime + Edge Functions）を採用しています。公開ビルドでは全対象URLを事前レンダリングし、ブラウザでhydrateします。

### 主な特徴

- 複数ルーム対応（`room_id`で分離された独立タイムライン）
- 旧お気楽チャット風の段組トップページ + ルーム別参加人数
- Chanariなりきりチャット（独立UI／設定／下書き保存）
- Supabase RealtimeのPostgres Changesによる新着配信
- Supabase Realtime broadcastによるlook／unlook通知
- 楽観的更新（Optimistic UI）による高速な操作体験
- オフライン／認証失敗時のfallback
- レトロUIデザイン（IE風のwindow style、text baseのtab header）
- route単位のcode splittingとSSRを使った静的事前レンダリング
- GitHub Pagesの独自ドメイン配信と`404.html`によるdeep link復元

---

## 2. 技術スタック

| カテゴリ               | 技術                     | バージョン |
| ---------------------- | ------------------------ | ---------- |
| フレームワーク         | React                    | 19.2.6     |
| 言語                   | TypeScript               | 6.0.3      |
| ビルドツール           | Vite                     | 8.0.13     |
| CSS                    | Tailwind CSS             | 4.1.8      |
| バックエンド           | Supabase (PostgreSQL)    | 2.105.4    |
| テスト                 | Vitest + Testing Library | 3.2.4      |
| コンポーネントカタログ | Storybook                | 10.4.0     |
| パッケージマネージャ   | pnpm 10                  | -          |
| 実行環境（CI / 推奨）  | Node.js 24               | -          |
| デプロイ               | GitHub Pages (gh-pages)  | -          |

---

## 3. ディレクトリ構成

```
src/
├── routes/                          # ルートごとのエントリポイント
│   ├── TopRoute.tsx                 # 旧トップページ (`/`)
│   ├── ChatRoute.tsx                # 通常チャット (`/chat/:roomId`)
│   ├── ChanariRoute.tsx             # なりきりチャット (`/chanari/:roomId`)
│   └── NotFoundRoute.tsx            # 404
├── features/                        # 機能モジュール（Feature-Based Architecture）
│   ├── chat/                        # 通常チャット機能
│   │   ├── api/
│   │   │   ├── roomLogStore.ts      # Room_Log_Store（取得・購読・取り直しをまとめた外部ストア）
│   │   │   ├── chatQueries.ts       # chats の読み取り（部屋・全部屋・ランキング）と論理削除
│   │   │   ├── saveChat.ts          # save-chat Edge Function での保存・楽観的チャットの生成
│   │   │   ├── realtime.ts          # Postgres Changes / look Broadcast の channel registry
│   │   │   └── retry.ts             # 指数バックオフと遅延の警告
│   │   ├── components/              # UI コンポーネント
│   │   │   ├── ChatRoom/            # メッセージ入力・送信
│   │   │   ├── ChatMessage/         # 個別メッセージ表示（React.memo）
│   │   │   ├── ChatLogList/         # メッセージ履歴一覧（React.memo + lazy）
│   │   │   ├── ChatRanking/         # 発言ランキング
│   │   │   ├── EntryForm/           # 入室フォーム
│   │   │   ├── ParticipantsList/    # 参加者一覧（useNowMinute 内製）
│   │   │   ├── RetroSplitter/       # リサイズ可能なペイン分割
│   │   │   └── shared/              # 機能内共通 UI
│   │   ├── hooks/
│   │   │   ├── useRoomLog.ts        # Room_Log_Store を読み useOptimistic を重ねる
│   │   │   ├── useChatSession.ts    # 入室 / 退室 / 送信 / コマンド（部屋単位・全部屋まとめ共通）
│   │   │   ├── useChatIdentity.ts   # 名前・色・メール・アバター
│   │   │   ├── useChatSender.ts     # 楽観的表示 → 保存 → 確定値のマージ（1 つの async Action）
│   │   │   ├── useParticipants.ts   # useDeferredValue（メモ化は React Compiler）
│   │   │   ├── useNowMinute.ts      # 1 分境界で再評価する現在時刻
│   │   │   ├── useLookSound.ts      # look/unlook 通知音
│   │   │   └── useSettings.ts
│   │   ├── utils/                   # validation / fortune / urlLinker / settingsStore / fallback など
│   │   ├── rooms.ts                 # 全 RoomId 列挙 + メタ情報
│   │   ├── routing.ts               # `/chat/:roomId` のルートマッチ
│   │   ├── types.ts                 # Chat / Participant / ChatMetadata / Avatar
│   │   └── index.ts
│   ├── chanari-chat/                # なりきりチャット機能
│   │   ├── ChanariChatPage.tsx
│   │   ├── routing.ts               # `/chanari/:roomId` のルートマッチ
│   │   ├── components/
│   │   │   ├── ChanariChatRoom/     # index.tsx + Storybook story
│   │   │   ├── ChanariEntryForm/    # index.tsx + Storybook story
│   │   │   ├── ChanariColorPicker/  # index.tsx + Storybook story
│   │   │   ├── ChanariCharCounter/  # index.tsx + Storybook story
│   │   │   └── ChanariTopHeader/    # index.tsx + Storybook story
│   │   ├── hooks/                   # useChanariSettings / useReloadInterval
│   │   ├── utils/                   # countChars / colorCode / draftStore / 各種 options
│   │   └── styles/                  # Chanari 専用 scoped CSS
│   └── top/                         # 旧トップページ機能
│       ├── TopPage.tsx              # オーケストレーションのみ（SEO + useRoomCounts + 各列 mount）
│       ├── data.ts                  # 表示用ルーム / pickup / ガイドメニュー / news 定義
│       ├── api/
│       │   └── roomCountsApi.ts     # 部屋別参加人数集計（Supabase）
│       ├── hooks/
│       │   └── useRoomCounts.ts
│       └── components/
│           ├── index.ts             # TopPage 用 barrel export
│           ├── Header/              # 旧ヘッダー部品群 + icons + scoped CSS + stories
│           ├── SectionTitle/        # h2 見出し（旧トップ共通）+ story
│           ├── RoomAnchor/          # ルームリンク（外部/内部判定を内包）+ story
│           ├── CountBadge/          # 参加人数バッジ + story
│           ├── LeftColumn/          # チャット一覧（RoomList を内包）+ story
│           ├── MainColumn/          # ピックアップ + 紹介タグ / X share + story
│           ├── RightColumn/         # サイドバー（タイムライン + ルール / 使い方）+ story
│           ├── TwitterTimeline/     # 公式 widgets.js による X タイムライン埋め込み + story
│           ├── Footer/              # フッター + story
│           └── shared/              # resolveCount / tones など top 内部共通ロジック
├── shared/                          # 機能横断の共通モジュール
│   ├── components/                  # Button / Input / ErrorBoundary
│   ├── hooks/                       # useSEO / useResetOnChange
│   ├── utils/                       # format / uuid / seo / clientInfo
│   └── supabaseClient.ts
├── pages/                           # ページレベルの単機能 view
│   └── NotFoundPage.tsx
├── styles/                          # グローバルスタイル
│   ├── theme.css                    # デザイントークン
│   ├── utilities.css
│   ├── okiraku-header.css           # 通常チャット用テーマ
│   └── chanari-header.css           # Chanari 用テーマ
├── storybook/                       # Storybook 用モックデータ
├── test/setup.ts                    # vitest 共通セットアップ
├── App.tsx                          # ルートマッチ + Route コンポーネントへの分岐
├── App.test.tsx
└── main.tsx                         # エントリーポイント

public/
├── 404.html                         # GitHub Pages SPA fallback（query 形式に rewrite）
├── avatars/                         # アバター画像
├── chanari/                         # Chanari 用画像
├── okiraku/                         # お気楽チャット用画像
├── sounds/
├── sitemap.xml                     # `scripts/generate-sitemap.ts` で自動生成（公開時は build:prod から呼ばれる）
├── sitemap.xsl / robots.txt / favicon.ico
├── ogp.png                          # OGP / Twitter Card 用画像
└── googlea88df218b8bbf9d2.html

scripts/
└── generate-sitemap.ts              # CHAT_ROOM_IDS から `/chat/<id>` 全列挙で sitemap.xml を生成

docs/
├── ARCHITECTURE.md
├── TEST_STRATEGY.md
└── migrations/
    ├── 001_add_metadata_column.sql
    └── 002_add_room_id_column.sql
```

---

## 4. アーキテクチャ設計

### 4.1 全体構成

Feature-Based Architecture を採用し、機能単位でコード（コンポーネント・フック・API・型）を凝集させています。`App.tsx` はルート解決だけを担当し、各ルートの実体は `src/routes/*` から `src/features/*` へ転送します。

```
┌────────────────────────────────────────────────────────────┐
│                         App.tsx                            │
│  resolveRoute(pathname) で RouteMatch / ChanariRouteMatch  │
│  を判定し、対応する Route コンポーネントだけを描画する     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐ ┌─────┐  │
│  │ TopRoute   │  │ ChatRoute  │  │ChanariRoute  │ │ 404 │  │
│  │ (legacy    │  │ (`/chat/   │  │ (`/chanari/  │ │     │  │
│  │  top page) │  │  :roomId`) │  │   :roomId`)  │ │     │  │
│  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘ └─────┘  │
│        │               │                │                  │
│        ▼               ▼                ▼                  │
│   features/top   features/chat    features/chanari-chat    │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                       Hooks 層                             │
│  useRoomLog / useChatSession / useParticipants             │
│  useNowMinute / useRoomCounts / useChanariSettings ...     │
├────────────────────────────────────────────────────────────┤
│                       API 層                               │
│  roomLogStore (取得 / 購読 / 取り直し)                     │
│  chatQueries / saveChat / realtime                         │
│  roomCountsApi   (トップ向け集計クエリ)                    │
│                          │                                 │
├──────────────────────────┼─────────────────────────────────┤
│                       Supabase                             │
│       PostgreSQL + Realtime (WebSocket)                    │
└────────────────────────────────────────────────────────────┘
```

### 4.2 ルーティング

ルーティングはフレームワークを使わず、`window.location.pathname` を `matchChanariRoute` → `matchRoute` の順に評価する自前実装です。`BASE_URL`（独自ドメイン直下の `/`）はマッチ前に剥がします。

```ts
type RouteMatch =
  | { type: 'top' }
  | { type: 'chat-room'; roomId: RoomId }
  | { type: 'redirect'; to: string }
  | { type: 'not-found' };

type ChanariRouteMatch =
  | { type: 'chanari-room'; roomId: RoomId }
  | { type: 'redirect'; to: string };
```

| パターン                  | 結果                                                 |
| ------------------------- | ---------------------------------------------------- |
| `/`                       | `TopRoute`                                           |
| `/chat`                   | `/chat/superbeginner` へ `replaceState` リダイレクト |
| `/chat/:roomId` (有効)    | `ChatRoute`                                          |
| `/chanari`                | `/chanari/superbeginner` へリダイレクト              |
| `/chanari/:roomId` (有効) | `ChanariRoute`                                       |
| 上記以外                  | `NotFoundRoute`                                      |

`App.tsx`は`popstate`監視と`redirect`種別の自動再評価を担当します。初期表示のトップだけを静的importし、`ChatRoute`、`AllRoomsRoute`、`ChanariRoute`、`NotFoundRoute`は`routeLoaders`経由でroute単位に`React.lazy`化しています。SSG済みURLでは対象route chunkをpreloadしてからhydrateし、完成済みHTMLを保持します。

### 4.3 レイヤー構成

| レイヤー          | 責務                       | 主要ファイル                                                                                                    |
| ----------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| UI コンポーネント | 描画・ユーザー操作         | `features/*/components/`、`shared/components/`                                                                  |
| カスタムフック    | 状態管理・ビジネスロジック | `features/*/hooks/`、`shared/hooks/`                                                                            |
| API 層            | データ取得・永続化・通信   | `features/chat/api/roomLogStore.ts`、`chatQueries.ts`、`saveChat.ts`、`realtime.ts`、`top/api/roomCountsApi.ts` |
| Supabase Client   | DB 接続・認証              | `shared/supabaseClient.ts`                                                                                      |

---

## 5. データフロー

### 5.1 メッセージ送信フロー（楽観的更新）

```
ユーザー入力
    │
    ▼
useChatSession.send() → useChatSender.sendUserMessage()（操作 ID を発行して send へ）
    │
    ├─ 1. createOptimisticChat()
    │     uuid: "temp-{timestamp}-{random}"
    │     client_time: Date.now()
    │     metadata.optimisticNonce: random UUID
    │     optimistic: true
    │
    └─ 2. useChatSender.send(): startTransition(async () => { … }) の 1 つの Action の中で
          │  （楽観的な値は、それを包む Action が pending の間だけ残る。以前は同期の
          │   startTransition で addOptimistic だけを呼んでいたため、Action の外から呼ぶ
          │   入室・退室・ちゃなりの発言では保存完了前に表示が消えていた）
          │
          ├─ 2a. addOptimistic(chat)
          │     → useOptimisticのreduceOptimisticChat reducer経由で即時UI反映
          │     → optimisticNonceを優先してRealtime echoとの重複を防止
          │
          ├─ 2b. await saveChatLogOptimistic(roomId, chat, { operationId })
          │     → supabase.functions.invoke('save-chat')
          │     → client payloadにip／uaは含めない
          │     → Edge Functionがrequest headerからip／uaを観測
          │     → service_roleでchatsへINSERT
          │     → UUID v7、time、ip_masked、uaを返却
          │     → 指数backoffで最大3回retry（operationIdは共通、attemptだけ増加）
          │
          ├─ 2c. startTransition(() => mergeChat(savedChat))
          │     → await の後は Transition の文脈が切れるので包み直す
          │     → 一時UUIDをserver UUID v7へ置換、optimistic: falseへ更新
          │
          └─ 保存に失敗したら Action の中で捕まえて reject（楽観的な表示は Action の終わりに消える）
```

INSERT後の管理者チャット（`com_sb`）は、response返却後に`EdgeRuntime.waitUntil`でtriageします。非system・1000文字以下の発言をOkiraku APIへ送り、`cr`確率0.5以上かつ1時間3件未満の場合だけGitHub Issueを作成し、管理人の受付発言を追加します。triage失敗は元の発言保存に影響させません。

### 5.2 リアルタイム受信フロー

```
Supabase Realtime (postgres_changes / broadcast)
    │
    ▼
subscribeChatLogs(roomId, callback)        ← room ごとに 1 channel を再利用
    │
    ▼
mergeChat(newChat)
    │
    ├─ 既存 UUID と一致 → 上書き更新
    └─ 新規 → 先頭に追加（最大 2000 件保持）
```

`realtime.ts` 内に `postgresEntries` (`chats-postgres-${roomId}`) と `broadcastEntries` (`chats-broadcast-${roomId}`) の refcount registry を持ち、Postgres Changes と Broadcast はそれぞれ room ごとに 1 channel を共有します。最後の listener が解除された時点で `supabase.removeChannel` で破棄され、send-only 利用（listener 0 での `broadcastLookEvent` / `broadcastUnlookEvent`）も送信完了後に同様に破棄されます。

### 5.3 初期読み込みフロー

```
ChatRoute マウント
    │
    ▼
useRoomLog(getRoomLogStore(roomId)) → useSyncExternalStore が store を購読
    │  （最初の購読で Realtime を張ってから取得。最後の解除で止める）
    │
    ├─ subscribeChatLogs(roomId, …)（realtime.ts）
    │   → 既存 channel があれば共有、なければ生成
    │
    └─ loadRecentChatLogs(roomId, limit)（chatQueries.ts。キャッシュは持たない）
        ├─ オフライン → mockChatData (room_id を付与) を返却
        ├─ 401 / JWT エラー → mockChatData にフォールバック
        └─ Supabase SELECT
             - 列: uuid, room_id, name, color, message, time, system, email, ip_masked, ua, metadata
               (ip の生値は転送から除外)
             - WHERE room_id = ? AND deleted = false
             - ORDER BY uuid DESC LIMIT limit（初期 10、入室で 100、行数の選択で最大 1000）
```

`/chat/:roomId` 直訪問時はトップを経由しないため、現状は事前 prefetch を呼んでいません（以前あった `earlyDataFetch` / `preloadCriticalResources` は削除済み）。画面遷移は全ページ読み込みなので、ページをまたぐキャッシュは持ちません（以前の `chatLogResource` の 5 分 TTL キャッシュは、1 ページの表示中にしか効かず Realtime の発言も入らないため削除しました）。

### 5.4 トップページの参加人数集計

```
TopRoute マウント
    │
    ▼
useRoomCounts(windowMs = 6h)
    │
    ▼
fetchRoomParticipantCounts()
    │
    ├─ Supabase 未設定 → {} を返す（左カラムは "0人" で安全に描画）
    ├─ POST /rest/v1/rpc/room_participant_counts { since_ms }
    │   → サーバーで room_id × ユニーク発言者を集計し、部屋の数ぶんの行だけ返す
    │     （論理削除・system 発言・管理人の発言・空の名前を除く）
    └─ RPC がまだ無い（404: マイグレーション適用前）
        → chats SELECT (room_id, name, system, metadata, time) を最大 5000 行取得して
          クライアント側で集計する（従来の方法）
```

初期表示はすべて `0人` で即時描画し、Supabase レスポンスで上書きする方針です。

---

## 6. 状態管理設計

### 6.1 状態管理方針

外部状態管理ライブラリ（Redux, Zustand 等）は使用せず、React 組み込みの Hooks で完結しています。

| フック               | 用途                                                                                                                                              | React API                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `useRoomLog`         | Room_Log_Store（取得・購読・取り直し）を読み、楽観的更新を重ねる                                                                                  | `useSyncExternalStore`, `useOptimistic`, `useEffectEvent` |
| `useChatSession`     | 入室・退室・送信・コマンド（部屋単位・全部屋まとめ共通）                                                                                          | `useState`（入室状態のみ）                                |
| `useChatIdentity`    | 名前・色・メール・アバター（永続化ストアの値を既定にする）                                                                                        | `useStoreBackedState`                                     |
| `useParticipants`    | 参加者リスト導出                                                                                                                                  | `useDeferredValue`（メモ化は React Compiler）             |
| `useNowMinute`       | 1 分境界で再評価する現在時刻                                                                                                                      | `useState`, `useEffect` (`setTimeout` + `setInterval`)    |
| `useRoomCounts`      | トップ用ルーム別参加人数                                                                                                                          | `useState`, `useEffect`                                   |
| `useChanariSettings` | Chanari の設定永続化                                                                                                                              | `useState`, `useEffect` (`localStorage`)                  |
| `useReloadInterval`  | Chanari のリロード間隔タイマー                                                                                                                    | `useEffect`                                               |
| `useSEO`             | メタ・OGP・Twitter Card・canonical の動的更新 (title / description / og:image を変更すると og:_ / twitter:_ / canonical / structured data も追従) | `useEffect`                                               |

### 6.2 Room_Log_Store（`features/chat/api/roomLogStore.ts`）

部屋（`getRoomLogStore(roomId)`）と全部屋まとめ（`getAllRoomsLogStore()`）ごとに 1 つの外部ストアを持ち、
次の規則をまとめて扱います。コンポーネントは `useRoomLog` で `useSyncExternalStore` から読み、取得や購読を
Effect の依存配列では制御しません。

| 契機                 | 処理                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------- |
| 最初の購読           | Realtime を張ってから取得（初期 10 件、全部屋まとめは 200 件）                            |
| Realtime の INSERT   | 確定行に uuid で合流。取得中ならバッファにも入れる                                        |
| 取得の完了           | 拡張なら表示中の行を残して合流、それ以外は取得結果 + バッファを正とする（論理削除を反映） |
| `connected` への遷移 | キャッシュを使わずに取り直す（SUBSCRIBED までと切断中の取りこぼしを埋める）               |
| `expand(n)`          | 件数を増やして取得（減らさない）                                                          |
| 最後の購読解除       | マイクロタスク後にまだ誰もいなければ止める（StrictMode の再購読で張り直さない）           |

store はサーバーで確定した行だけを持ち、楽観的な表示は `useRoomLog` の `useOptimistic`
（`utils/optimisticLog.ts` の `reduceOptimisticChat`）で重ねます。

### 6.3 派生値の最適化

- `useParticipants` は `useDeferredValue(chatLog)` で入力側を遅延化したうえで `getRecentParticipants` を呼ぶ。メモ化は React Compiler が行うため手動の `useMemo` は置かない。
- `ChatLogList` は `React.memo` でラップする。内部の `sortChatsByTime` → `slice(0, windowRows)` のメモ化は React Compiler に任せる。
- `ChatMessage` も `React.memo` 化（shallow compare で十分）。
- `ParticipantsList` は `useNowMinute()` を内製しており、親に `currentTime` プロップを渡させない。1 分に 1 度だけ再描画する。

---

## 7. API 層設計

### 7.1 features/chat/api の構成

| モジュール        | 主なエクスポート                                                                             | 役割                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `roomLogStore.ts` | `getRoomLogStore(roomId)` / `getAllRoomsLogStore()`                                          | 取得・購読・取り直し・件数の拡張をまとめた外部ストア（§6.2）                                 |
| `chatQueries.ts`  | `loadRecentChatLogs` / `loadAllRoomsChatLogs` / `loadChatRanking` / `clearChatLogsByName`    | chats の読み取りと論理削除。キャッシュは持たない。オフライン・401 時は mockChatData を返す   |
| `saveChat.ts`     | `saveChatLogOptimistic` / `createOptimisticChat`                                             | save-chat Edge Function での保存（操作 ID と試行番号をヘッダで送る）と、楽観的チャットの生成 |
| `realtime.ts`     | `subscribeChatLogs` / `subscribeAllRoomsChatLogs` / `broadcastLookEvent` / `onLookBroadcast` | room ごとに 1 channel を共有する refcount registry と、全部屋まとめの購読                    |
| `retry.ts`        | `retryWithBackoff` / `warnIfSlow`                                                            | 指数バックオフ（1 秒 → 2 秒、最大 3 回）と、3 秒を超えた呼び出しの警告                       |

以前は `chatLogResource.ts`（5 分の TTL キャッシュ、進行中のリクエストの共有、paging、世代管理）と
`chatApi.ts`（保存・削除・ランキング・Realtime・互換ラッパー）に分かれていましたが、画面遷移が全ページ読み込み
であるためキャッシュはほとんど効かず、責務も混ざっていたので上の構成に分けました
（`.kiro/specs/react-2026-refactoring` Requirement 5 / 6）。

### 7.2 features/top/api/roomCountsApi.ts

トップページ用に、直近 `windowMs`（既定 6 時間）以内の `room_id × ユニーク発言者` を RPC `room_participant_counts`（`supabase/migrations/20260923000000_room_participant_counts.sql`）でサーバー集計します。RPC が DB にまだ無いときは、従来どおり発言の行を取得してクライアントで数えます。`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 未設定時は空 `{}` を返し、UI 側が全ルーム `0人` で描画して破綻しないようにしてあります。

---

## 8. データモデル

### 8.1 Chat 型

```typescript
type Chat = {
  uuid: string; // UUID v7（サーバー側で自動生成、主キー）
  room_id?: RoomId; // 部屋ごとのログ分離（旧データ互換のため optional）
  name: string;
  color: string;
  message: string;
  time: number; // Unix timestamp ms（サーバー側で設定）
  client_time?: number; // クライアント投稿時刻（楽観的更新 dedup の fallback キー）
  optimistic?: boolean; // 楽観的更新フラグ
  system?: boolean; // システムメッセージフラグ
  email?: string;
  ip: string; // クライアント IP（読み出し時は通常 SELECT しない）
  ua: string; // User-Agent（同上）
  metadata?: ChatMetadata; // フォントスタイル / アバター / kind / userColor / optimisticNonce 等
};
```

楽観的更新の dedup 主キーは `metadata.optimisticNonce`（`createOptimisticChat` がランダム生成）で、両側に nonce が揃っていればこちらだけで一致判定する。`client_time` は nonce 未付与の旧データへの fallback キーとして使うが、両側で数値であることを必須条件とする（`undefined === undefined` の誤一致を避けるため）。

`ChatMetadata.kind = 'admin'` の管理人発言には `userColor` を持たせ、Welcome / 退室メッセージを `ParticipantsList` への参加者集計に用います（`useParticipants.getRecentParticipants` 参照）。

### 8.2 UUID v7 の活用

- **ソート**: `ORDER BY uuid DESC` で時系列降順（`time` カラムのインデックス不要）
- **範囲検索**: `generateUUIDv7FromTimestamp()` で時間範囲を UUID 範囲に変換
- **プライバシー**: クライアント側 UUID 生成時にランダムオフセット付与（最大 30 秒）

### 8.3 Supabase テーブル構成

```
テーブル: chats
├── uuid       (UUID v7, PRIMARY KEY, サーバー自動生成)
├── room_id    (TEXT, NOT NULL, DEFAULT 'superbeginner')   ← 002 migration
├── name       (TEXT)
├── color      (TEXT)
├── message    (TEXT)
├── time       (BIGINT, サーバー自動設定)
├── client_time(BIGINT, NULLABLE)
├── system     (BOOLEAN)
├── email      (TEXT, NULLABLE)
├── ip         (TEXT)
├── ua         (TEXT)
├── metadata   (JSONB, NULLABLE)                            ← 001 migration
└── deleted    (BOOLEAN, DEFAULT FALSE)

インデックス:
- idx_chats_room_uuid         : (room_id, uuid DESC)
- idx_chats_room_deleted_uuid : (room_id, uuid DESC) WHERE deleted = FALSE
```

マイグレーションファイル:

- `docs/migrations/001_add_metadata_column.sql`
- `docs/migrations/002_add_room_id_column.sql`（既存ログを `superbeginner` に集約）

### 8.4 RoomId / RoomMeta

ルーム ID は `src/features/chat/rooms.ts` の `CHAT_ROOM_IDS` で型レベル列挙されており（`superbeginner` / `hajime` / ... / Chanari ルーム `durarara` / `vocaloid` ...）、`isRoomId` / `isEnabledRoomId` で型ガード可能。`isRoomId` は `Object.prototype.hasOwnProperty` で `__proto__` 等の prototype 汚染を防ぐ実装になっています。

---

## 9. UI / デザインシステム

### 9.1 デザイントークン

```css
/* src/styles/theme.css */
--color-yui-green: #a1fe9f; /* メイン背景色 */
--color-yui-pink: #ff69b4; /* アクセントカラー */
--color-yui-pink-light: #ffe4ef; /* ライトピンク */
--color-ie-gray: #b1b1b1; /* IE 風グレー */
--color-ie-blue: #4a90e2; /* IE 風ブルー */
--color-ie-bg: #f3f3f3; /* IE 風背景 */

--font-yui:
  'MS PGothic', 'ＭＳ Ｐゴシック', 'MS UI Gothic', Osaka, 'Hiragino Kaku Gothic ProN',
  'Hiragino Sans', Meiryo, sans-serif;
```

通常チャット / Chanari のテーマ別ヘッダースタイルは `src/styles/okiraku-header.css` / `chanari-header.css` に scoped で配置しています。

### 9.2 主要コンポーネント

| コンポーネント               | 責務                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `RetroSplitter`              | 上下ペインのリサイズ可能な分割レイアウト                                                                                                   |
| `ChatRoom`                   | メッセージ入力・送信・退室ボタン                                                                                                           |
| `EntryForm`                  | 名前・色・メール入力、入室ボタン                                                                                                           |
| `ChatLogList` (memo + lazy)  | メッセージ履歴の表示。`sortChatsByTime`（uuid v7 降順）→ `slice(0, windowRows)`、内部で `useParticipants` を呼ぶ                           |
| `ChatMessage` (memo)         | 個別メッセージの描画（管理人 / 通常 / URL リンク化）                                                                                       |
| `ChatRanking`                | 発言数ランキング表示                                                                                                                       |
| `ParticipantsList`           | 直近 5 分以内の参加者一覧。`useNowMinute()` を内製                                                                                         |
| `TopPage` + `components/*`   | 旧ヘッダー / 左中央右の 3 カラム / フッターを `components/` 配下のコンポーネント別フォルダに分割。`TopPage.tsx` はオーケストレーションのみ |
| `ChanariChatPage` + 関連部品 | Chanari 用 UI、名前色 / 発言色 / 文字数カウンタ / リロード間隔                                                                             |

### 9.3 トップページ

`src/features/top/data.ts` で旧トップに表示するルーム / pickup / ガイドメニュー / news 等を定義し、`TopPage` は `useSEO` / `usePageView` / `useRoomCounts` のセットアップと 3 カラム + ヘッダー / フッターの mount のみを担当します。各セクションは `components/{LeftColumn,MainColumn,RightColumn,Footer,...}/index.tsx` に分割され、`components/index.ts` から barrel export します。`TopPage.tsx` 自体は 50 行未満です。各ルーム名のリンクは `/chat/:roomId` または `/chanari/:roomId` の内部ルートへ統一されています。

- ヘッダー上部の **ガイドメニュー** (`data.ts: guideMenu`) は label / iconKind / href を一元管理。FAQ / プロフィール作成は遷移先未整備のため当面コメントアウトで非表示。
- ヘッダー下部の **セカンダリタブ** (`data.ts: tabNav`) は各タブが実ルートへ直接遷移し、「なりきりチャット」のみ `#pickup-narikiri` で `MainColumn` 内の h3 へジャンプ。
- `MainColumn` 末尾の `#linkguide` セクションに、紹介リンクタグ用 textarea と X (Twitter) Web Intent ボタン (`https://x.com/intent/tweet?...`) を配置。
- `RightColumn` の `@chat_a のつぶやき` には `TwitterTimeline` を埋め込み。`widgets.js` は `id="twitter-wjs"` で重複ロードを避け、`twttr.widgets.load()` で SPA 再マウント時にも再スキャン。
- 表示コンポーネントは原則 `ComponentName/index.tsx` と `ComponentName.stories.tsx` を同じフォルダに置き、表示確認は Storybook / Chromatic で行います。`resolveCount` / `tones` のような非 UI 共通ロジックは `components/shared/` に分離します。

### 9.4 Chanari なりきりチャット

- `/chanari/:roomId` 配下で動作。通常チャットと完全に分離した UI / 設定ストア
- `localStorage` に設定（名前色・発言色・リロード秒数・フォントサイズ・効果）と下書きを永続化
- `ChanariCharCounter` でメッセージ長を可視化
- `useReloadInterval` で N 秒ごとに `loadChatLogs` を再取得
- `colorCode.ts` でユーザー入力色の正規化、`countChars.ts` で文字数算出
- `ChanariChatRoom` / `ChanariEntryForm` / `ChanariColorPicker` / `ChanariCharCounter` / `ChanariTopHeader` は各フォルダ内に Storybook story を持ち、`chanari-scope` decorator で専用 CSS を適用して表示確認します。

### 9.5 レスポンシブ対応

- `min-h-dvh` / `h-dvh` でモバイルビューポート対応
- Tailwind CSS のユーティリティクラスによるレスポンシブレイアウト
- `RetroSplitter` による動的なペインサイズ調整

---

## 10. パフォーマンス最適化

### 10.1 ビルド最適化

| 最適化       | 設定                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| コード分割   | Rolldown の `codeSplitting.groups` で vendor 分離（`vendor-react`, `vendor-supabase`, `vendor-<name>`） |
| Tree Shaking | Vite 8 / Rolldown 向けに Rollup `recommended` 相当の `treeshake` オブジェクトを明示                     |
| 圧縮         | Terser（`console.log` 削除、変数名短縮）                                                                |
| CSS 圧縮     | Lightning CSS                                                                                           |
| ターゲット   | ES2022                                                                                                  |

### 10.2 ランタイム最適化

| 最適化                | 実装                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 遅延読み込み          | トップ以外のrouteを`React.lazy()`で分割し、SSG済みURLでは対象chunkをpreloadしてからhydrate                                      |
| 楽観的更新            | `useOptimistic` + `reduceOptimisticChat` で即時反映 + 重複表示防止                                                              |
| トランジション        | `useTransition` / `startTransition` で低優先度更新                                                                              |
| 派生値のメモ化        | React Compiler が自動メモ化。`ChatLogList` / `ChatMessage` はコンポーネント境界として `React.memo` を維持                       |
| `useParticipants`     | `useDeferredValue(chatLog)` で入力側を遅延化し、再計算を抑制                                                                    |
| 時刻更新の節約        | `useNowMinute` で 1 分境界まで `setTimeout` → 以降 60s `setInterval`                                                            |
| 取得の共有            | 同じ部屋の取得と購読は Room_Log_Store が 1 つにまとめ、世代番号で古い取得の結果を捨てる                                         |
| Supabase帯域削減      | 取得SELECTから生`ip`／`ua`を除外し、保存responseはUUID／時刻／表示用server観測値だけを返す                                      |
| Realtime チャネル共有 | Postgres Changes / Broadcast はそれぞれ room ごとに 1 channel を共有 (`postgresEntries` / `broadcastEntries` refcount registry) |
| パフォーマンス監視    | 3 秒超の API 呼び出しを `console.warn`                                                                                          |

---

## 11. エラーハンドリング・耐障害性

### 11.1 オフライン対応

```
navigator.onLine === false
    → loadRecentChatLogs が mockChatData（room_id 付与）を返す
    → ネットワーク復旧時に自動再取得（Realtime の再接続で Room_Log_Store が取り直す）
```

### 11.2 認証エラー対応

```
Supabase 401 / JWT エラー
    → mockChatData にフォールバック（サービス継続）
```

### 11.3 Supabase 未設定

```
VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定
    → top の useRoomCounts は {} を返し、左カラムは "0人" で描画継続
```

### 11.4 リトライ

- 取得系（`chatQueries`）と書き込み系（`saveChat`）に共通の指数バックオフ（`retry.ts`、最大 3 回）
- 最終失敗時のみエラー throw

---

## 12. セキュリティ

| 項目              | 対応                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------- |
| ブラウザ接続      | user sessionを作らず、公開anon keyでPostgREST／Realtime／Functionへ接続                       |
| INSERT境界        | clientの直接INSERTは許可せず、`save-chat`が`service_role`で実行                               |
| Edge Function     | 匿名チャットのため`verify_jwt = false`。payloadを検証し、service role keyはserver側だけで保持 |
| IP／UA            | client payloadでは受け取らずEdgeのrequest headerから観測。clientには`ip_masked`だけを公開     |
| 秘密値            | `JEV_API_TOKEN`、`GITHUB_TOKEN`、New Relic／PagerDutyのserver keyを`VITE_*`へ置かない         |
| Prototype汚染対策 | `isRoomId`は`Object.prototype.hasOwnProperty`で判定                                           |
| 入力validation    | 名前必須・24文字以内などをEdgeでも検証                                                        |
| 本番build         | `console.log`削除、source map無効化                                                           |

---

## 13. テスト戦略

詳細は [TEST_STRATEGY.md](./TEST_STRATEGY.md) を参照。

| 種別                     | ツール                  | カバレッジ閾値                                |
| ------------------------ | ----------------------- | --------------------------------------------- |
| ユニットテスト           | Vitest                  | 50%（lines, functions, branches, statements） |
| コンポーネントテスト     | Testing Library + jsdom | 同上                                          |
| ビジュアルリグレッション | Storybook + Chromatic   | -                                             |
| パフォーマンス           | Lighthouse              | -                                             |

### テストファイル配置

テストファイルはソースファイルと同じディレクトリに配置（コロケーション）。

```
roomLogStore.ts
roomLogStore.test.ts   ← 同一ディレクトリ
```

### 注目すべきテスト

- `src/App.test.tsx`: 各ルートが即時描画されること（top / chat / chanari / 404）
- `src/features/chat/routing.test.ts` / `src/features/chanari-chat/routing.test.ts`: ルート解決
- `src/features/top/TopPage.test.tsx` / `roomCountsApi.test.ts`: 旧トップ + 参加人数集計
- `src/features/chat/api/chatQueries.test.ts` / `saveChat.test.ts` / `realtime.test.ts`: API 層
- `src/features/chat/components/ChatLogList/ChatLogList.test.tsx`: memo による不要再計算抑制
- `src/features/chat/hooks/useRoomLog.test.ts` / `api/roomLogStore.test.ts`: 取得と Realtime の整合性
- `src/features/chat/utils/optimisticLog.test.ts`: 楽観的更新の temp/saved dedup
- `src/features/chanari-chat/utils/*.test.ts`: 文字数 / 色コード / localStorage draft / リロード間隔

---

## 14. CI/CD・デプロイ

### 14.1 GitHub Actions

`.github/workflows/ci.yml` — テスト走行（PR トリガー）

```yaml
on:
  pull_request:
    types: [opened, reopened, synchronize]
jobs:
  test:
    - actions/checkout@v4
    - actions/setup-node@v6  (node 24)
    - npm install -g pnpm
    - pnpm install
    - pnpm test # continue-on-error: true
```

`.github/workflows/chromatic.yml` — Storybook ビジュアルリグレッション

```yaml
on:
  push:        { branches: [main, develop] }
  pull_request:{ branches: [main, develop] }
env:
  CHROMATIC_BRANCH: ${{ ... head.ref || github.ref_name }}
  CHROMATIC_SHA:    ${{ ... head.sha || github.sha }}
  CHROMATIC_SLUG:   ${{ github.repository }}
jobs:
  chromatic-deployment:
    - actions/checkout@v6
    - pnpm/action-setup@v6   (version: 10)
    - actions/setup-node@v6  (node-version 24, cache: pnpm)
    - pnpm install --frozen-lockfile
    - pnpm build-storybook
    - chromaui/action@latest (onlyChanged: true, exitOnceUploaded: true)
```

### 14.2 GitHub Pages SPA fallback

`public/404.html` は不明パスを `/?/<元 path>&<query>` 形式に書き換えて再ロード、`index.html` の冒頭スクリプトが `?/` で始まる search を検知して `history.replaceState` で元の path に戻します（`~and~` で `&` をエンコード）。これにより `/chat/:roomId` / `/chanari/:roomId` への直アクセス（ブックマーク・SNS 共有）が SPA として復元可能です。

### 14.3 デプロイ

```bash
pnpm build:prod    # sitemap → client build → SSR build → 全対象URLのprerender
pnpm deploy        # predeployでbuild:prodを実行後、gh-pages -d dist
```

デプロイ先: `https://www.okiraku.chat/`

フロントエンドのGitHub Pages公開workflowはなく、現在は`pnpm deploy`によるデプロイです。`dist-ssr/`はprerender処理のserver bundleで、公開対象は`dist/`です。

### 14.4 ドメイン移行の背景

当初は GitHub Pages の project site 構成で公開していたため、公開 URL にリポジトリ名由来のサブパスが含まれていました。現在はブランド名と共有 URL を一致させるため、独自ドメイン直下で公開する構成へ移行しています。これにより、ユーザー向け URL を短く固定でき、将来的にホスティング先を GitHub Pages 以外へ切り替える場合でも公開 URL を維持しやすくなります。

この移行に合わせて、実装側では以下を root 配信前提にそろえています。

- Vite の `base` を `/` に変更し、ビルド成果物のアセット参照を独自ドメイン直下に統一
- `matchRoute` / `matchChanariRoute` が参照する `BASE_URL` を root 前提で扱い、ルーターに追加の basename を持ち込まない構成を維持
- `canonical` / OGP / Twitter Card / JSON-LD / sitemap / robots.txt の公開 URL を独自ドメインへ統一し、SEO シグナルを分散させない
- `public/404.html` の deep link 復元設定を root 配信向けに調整し、`/chat/:roomId` と `/chanari/:roomId` の直アクセスを従来どおり復元

要するに、今回のドメイン移行は単なる表記変更ではなく、「公開 URL を独自ドメインに固定しつつ、SPA の deep link と SEO メタデータを壊さずに運用基盤だけを差し替えられる状態」にするための整理です。

---

## 15. 開発環境

### 15.1 必要な環境変数

`.env.example`を`.env`へコピーします。全変数の用途、配置先、必須／任意、公開区分は[READMEの「環境変数とSecrets」](../README.md#環境変数とsecrets)を正とします。

```env
# Browserへ公開されるlive接続設定
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=public-anon-key

# Browser New Relicは5項目すべて揃った場合だけ有効
VITE_NEW_RELIC_ACCOUNT_ID=
VITE_NEW_RELIC_TRUST_KEY=
VITE_NEW_RELIC_AGENT_ID=
VITE_NEW_RELIC_BROWSER_KEY=
VITE_NEW_RELIC_APP_ID=
```

`VITE_*`はclient bundleへ埋め込まれるため秘密値を置きません。`JEV_API_TOKEN`、`GITHUB_TOKEN`、`NEW_RELIC_LICENSE_KEY`などはSupabase Secretsへ別途登録します。Supabase設定がない場合もfallback表示はできますが、liveの保存、Realtime、参加人数取得は利用できません。

### 15.2 主要コマンド

| コマンド                | 用途                                                          |
| ----------------------- | ------------------------------------------------------------- |
| `pnpm dev`              | 開発サーバー起動                                              |
| `pnpm build`            | プロダクションビルド                                          |
| `pnpm generate:sitemap` | `CHAT_ROOM_IDS` から `public/sitemap.xml` を生成              |
| `pnpm build:prod`       | sitemap生成 → client build → SSR build → 全対象URLのprerender |
| `pnpm preview`          | ビルド成果物のローカル確認                                    |
| `pnpm test`             | テスト実行（1 回）                                            |
| `pnpm watch:test`       | テスト監視モード                                              |
| `pnpm test:ui`          | Vitest UI                                                     |
| `pnpm lint`             | ESLint チェック                                               |
| `pnpm format`           | Prettier フォーマット                                         |
| `pnpm typecheck`        | TypeScript 型チェック                                         |
| `pnpm storybook`        | Storybook 起動（port 6006）                                   |
| `pnpm lighthouse`       | Lighthouse パフォーマンス監査                                 |
| `pnpm deploy`           | GitHub Pages デプロイ                                         |

### 15.3 コード品質ツール

| ツール     | 設定ファイル        | 主な設定                                                                          |
| ---------- | ------------------- | --------------------------------------------------------------------------------- |
| ESLint     | `eslint.config.js`  | React Hooks, React Refresh, Prettier 連携、`.kiro` 等を ignore、Markdown は対象外 |
| Prettier   | `.prettierrc`       | シングルクォート、100 文字幅、セミコロンあり                                      |
| TypeScript | `tsconfig.app.json` | strict モード、パスエイリアス                                                     |
| Lefthook   | `lefthook.yml`      | Git フック（コミット前チェック）                                                  |

### 15.4 パスエイリアス

```typescript
import { supabase } from '@shared/supabaseClient';
import type { Chat } from '@features/chat/types';
```

| エイリアス    | 実パス           |
| ------------- | ---------------- |
| `@features/*` | `src/features/*` |
| `@shared/*`   | `src/shared/*`   |
