# ゆいちゃっとTS 技術設計ドキュメント

## 1. プロジェクト概要

ゆいちゃっとTSは「放課後学生タウン」の雰囲気を再現した、ブラウザベースのリアルタイムチャットアプリケーションです。React + TypeScript で構築された SPA で、バックエンドに Supabase（PostgreSQL + Realtime）を採用しています。

### 主な特徴

- リアルタイムチャット（Supabase Realtime による即時反映）
- 楽観的更新（Optimistic UI）による高速な操作体験
- クロスタブ同期（BroadcastChannel API）
- オフラインフォールバック対応
- レトロ UI デザイン（IE 風のウィンドウスタイル）
- GitHub Pages へのデプロイ

---

## 2. 技術スタック

| カテゴリ               | 技術                     | バージョン |
| ---------------------- | ------------------------ | ---------- |
| フレームワーク         | React                    | 19.1.0     |
| 言語                   | TypeScript               | 5.8.3      |
| ビルドツール           | Vite                     | 6.3.5      |
| CSS                    | Tailwind CSS             | 4.1.8      |
| バックエンド           | Supabase (PostgreSQL)    | 2.39.6     |
| テスト                 | Vitest + Testing Library | 3.2.3      |
| コンポーネントカタログ | Storybook                | 9.1.8      |
| パッケージマネージャ   | pnpm                     | -          |
| デプロイ               | GitHub Pages (gh-pages)  | -          |

---

## 3. ディレクトリ構成

```
src/
├── features/                    # 機能モジュール（Feature-Based Architecture）
│   └── chat/                    # チャット機能
│       ├── api/                 # Supabase API 層
│       │   ├── chatApi.ts       # CRUD・購読・キャッシュ・リトライ
│       │   └── chatApi.test.ts
│       ├── components/          # UI コンポーネント
│       │   ├── ChatRoom/        # チャットルーム（メッセージ入力・送信）
│       │   ├── ChatMessage/     # 個別メッセージ表示
│       │   ├── ChatLogList/     # メッセージ履歴一覧
│       │   ├── ChatRanking/     # 発言ランキング
│       │   ├── EntryForm/       # 入室フォーム
│       │   ├── ParticipantsList/ # 参加者一覧
│       │   ├── RetroSplitter/   # リサイズ可能なペイン分割
│       │   └── shared/          # コンポーネント共通ユーティリティ
│       ├── hooks/               # カスタムフック
│       │   ├── useChatLog.ts    # チャット状態管理（楽観的更新含む）
│       │   ├── useChatHandlers.ts # イベントハンドラ集約
│       │   ├── useParticipants.ts # 参加者リスト導出
│       │   ├── useChatRanking.ts  # ランキング計算
│       │   ├── useOptimisticChat.ts
│       │   └── usePreloadChatLogs.ts # プリロード・早期取得
│       ├── utils/               # 機能固有ユーティリティ
│       │   ├── validation.ts    # 入力バリデーション
│       │   └── fallback.ts      # オフラインモックデータ
│       ├── types.ts             # 型定義（Chat, Participant, BroadcastMsg）
│       └── index.ts
├── shared/                      # 機能横断の共通モジュール
│   ├── components/              # 汎用 UI コンポーネント
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Loader.tsx
│   │   └── TermsModal.tsx
│   ├── hooks/                   # 共通フック
│   │   ├── useSEO.ts            # メタデータ管理
│   │   └── useBroadcastChannel.ts # クロスタブ通信
│   ├── utils/                   # 共通ユーティリティ
│   │   ├── format.ts            # 時刻フォーマット
│   │   ├── uuid.ts              # UUID v7 生成・操作
│   │   ├── seo.ts               # SEO ヘルパー
│   │   └── clientInfo.ts        # クライアント情報取得
│   └── supabaseClient.ts        # Supabase クライアント初期化
├── pages/                       # ページコンポーネント
│   └── ChatLogPage.tsx
├── styles/                      # グローバルスタイル
│   ├── theme.css                # デザイントークン
│   └── utilities.css
├── content/                     # MDX コンテンツ
│   └── terms.mdx                # 利用規約
├── test/                        # テストセットアップ
│   └── setup.ts
├── App.tsx                      # ルートコンポーネント
├── App.css
└── main.tsx                     # エントリーポイント
```

---

## 4. アーキテクチャ設計

### 4.1 全体構成

Feature-Based Architecture を採用し、機能単位でコード（コンポーネント・フック・API・型）を凝集させています。

```
┌─────────────────────────────────────────────────────┐
│                     App.tsx                          │
│              （ルートコンポーネント）                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │  EntryForm   │  │   ChatRoom   │                 │
│  │  （入室前）    │  │  （入室後）    │                 │
│  └──────────────┘  └──────┬───────┘                 │
│                           │                         │
│  ┌────────────────────────┼──────────────────────┐  │
│  │              RetroSplitter                    │  │
│  │  ┌─────────────────┐  │  ┌─────────────────┐ │  │
│  │  │   上ペイン       │  │  │   下ペイン       │ │  │
│  │  │ ChatRoom /      │  │  │ ChatLogList /   │ │  │
│  │  │ EntryForm       │  │  │ ChatRanking     │ │  │
│  │  └─────────────────┘  │  └─────────────────┘ │  │
│  └───────────────────────┴──────────────────────┘  │
│                                                     │
├─────────────────────────────────────────────────────┤
│                  Hooks 層                            │
│  useChatLog / useChatHandlers / useParticipants     │
├─────────────────────────────────────────────────────┤
│                  API 層                              │
│  chatApi.ts → Supabase Client                       │
├─────────────────────────────────────────────────────┤
│                  Supabase                            │
│  PostgreSQL + Realtime (WebSocket)                  │
└─────────────────────────────────────────────────────┘
```

### 4.2 レイヤー構成

| レイヤー          | 責務                       | 主要ファイル               |
| ----------------- | -------------------------- | -------------------------- |
| UI コンポーネント | 描画・ユーザー操作         | `components/` 配下         |
| カスタムフック    | 状態管理・ビジネスロジック | `hooks/` 配下              |
| API 層            | データ永続化・通信         | `api/chatApi.ts`           |
| Supabase Client   | DB 接続・認証              | `shared/supabaseClient.ts` |

---

## 5. データフロー

### 5.1 メッセージ送信フロー（楽観的更新）

```
ユーザー入力
    │
    ▼
useChatHandlers.handleSend()
    │
    ├─ 1. 楽観的 Chat オブジェクト生成（一時 UUID + 未来タイムスタンプ）
    │     uuid: "temp-{timestamp}-{random}"
    │     time: Date.now() + 1年（確実に先頭表示）
    │     optimistic: true
    │
    ├─ 2. startTransition(() => addOptimistic(chat))
    │     → React useOptimistic で即座に UI 反映
    │
    ├─ 3. クライアント情報取得（IP, UA）を並列実行
    │
    ├─ 4. saveChatLogOptimistic(chat) → Supabase INSERT
    │     → サーバー側で UUID v7 と time を生成
    │     → 最小限の select('uuid,time') で応答
    │
    └─ 5. startTransition(() => mergeChat(savedChat))
          → 一時 UUID をサーバー UUID v7 に置換
          → optimistic: false に更新
```

### 5.2 リアルタイム受信フロー

```
Supabase Realtime (postgres_changes)
    │
    ▼
subscribeChatLogs(callback)
    │
    ▼
mergeChat(newChat)
    │
    ├─ 既存 UUID と一致 → 上書き更新
    └─ 新規 → 先頭に追加（最大 2000 件保持）
```

### 5.3 初期読み込みフロー

```
App マウント
    │
    ├─ preloadCriticalResources()  # リソースプリロード
    ├─ earlyDataFetch()            # 早期データ取得
    │
    ▼
useChatLog() → useEffect
    │
    ├─ loadChatLogs()
    │   ├─ キャッシュヒット（5分以内） → キャッシュ返却
    │   ├─ オフライン → モックデータ返却
    │   └─ Supabase SELECT（UUID v7 降順、100件）
    │
    └─ subscribeChatLogs(mergeChat)
        → Realtime チャネル購読開始
```

---

## 6. 状態管理設計

### 6.1 状態管理方針

外部状態管理ライブラリ（Redux, Zustand 等）は使用せず、React 組み込みの Hooks で完結しています。

| フック                | 用途                       | React API                                  |
| --------------------- | -------------------------- | ------------------------------------------ |
| `useChatLog`          | チャットログ全体の管理     | `useState`, `useOptimistic`, `useCallback` |
| `useChatHandlers`     | 入室・退室・送信・リロード | `useCallback`, `useTransition`             |
| `useParticipants`     | 参加者リスト導出           | `useDeferredValue`                         |
| `useSEO`              | メタデータ管理             | `useEffect`                                |
| `useBroadcastChannel` | クロスタブ通信             | `useRef`, `useEffect`                      |

### 6.2 useChatLog の内部構造

```typescript
// 主要な状態
const [chatLog, setChatLog] = useState<Chat[]>([]);
const [isLoading, setIsLoading] = useState(true);

// 楽観的更新（React 19 useOptimistic）
const [optimisticLog, addOptimistic] = useOptimistic(chatLog, (state, chat) =>
  [chat, ...state].slice(0, 2000)
);

// マージ関数（UUID ベースの重複排除）
const mergeChat = useCallback((chat: Chat) => {
  setChatLog((prev) => {
    const idx = prev.findIndex((c) => c.uuid === chat.uuid);
    if (idx !== -1) {
      /* 上書き */
    }
    return [chat, ...prev].slice(0, 2000);
  });
}, []);
```

---

## 7. API 層設計（chatApi.ts）

### 7.1 主要関数

| 関数                         | 用途                     | 特徴                                            |
| ---------------------------- | ------------------------ | ----------------------------------------------- |
| `loadChatLogs()`             | チャットログ取得         | キャッシュ（5分 TTL）、オフラインフォールバック |
| `loadChatLogsWithPaging()`   | ページネーション付き取得 | offset/limit ベース                             |
| `saveChatLogOptimistic()`    | 楽観的更新用保存         | 最小 select、非同期キャッシュ無効化             |
| `saveChatLog()`              | 従来互換の保存           | 全カラム select                                 |
| `saveChatLogFireAndForget()` | 非ブロッキング保存       | レスポンス不要の最高速版                        |
| `clearChatLogs()`            | 全件削除                 | キャッシュ無効化付き                            |
| `loadChatLogsByTimeRange()`  | 時間範囲検索             | UUID v7 範囲クエリ最適化                        |
| `subscribeChatLogs()`        | リアルタイム購読         | Supabase Realtime (postgres_changes)            |

### 7.2 リトライ戦略

```
試行 1 → 失敗 → 1秒待機
試行 2 → 失敗 → 2秒待機（指数バックオフ）
試行 3 → 失敗 → エラー throw
```

### 7.3 キャッシュ戦略

- インメモリキャッシュ（TTL: 5分）
- 書き込み時にキャッシュ無効化
- 楽観的更新時は非同期で無効化（UI ブロッキング回避）

---

## 8. データモデル

### 8.1 Chat 型

```typescript
type Chat = {
  uuid: string; // UUID v7（サーバー側で自動生成、主キー）
  name: string; // 表示名
  color: string; // ユーザーカラー（HEX）
  message: string; // メッセージ本文
  time: number; // Unix timestamp ms（サーバー側で設定）
  client_time?: number; // クライアント投稿時刻（楽観的更新用）
  optimistic?: boolean; // 楽観的更新フラグ
  system?: boolean; // システムメッセージフラグ
  email?: string; // メールアドレス（任意）
  ip: string; // クライアント IP
  ua: string; // User-Agent
};
```

### 8.2 UUID v7 の活用

UUID v7 はタイムスタンプを内包するため、以下の最適化に活用しています。

- **ソート**: `ORDER BY uuid DESC` で時系列降順（`time` カラムのインデックス不要）
- **範囲検索**: `generateUUIDv7FromTimestamp()` で時間範囲を UUID 範囲に変換
- **プライバシー**: クライアント側 UUID 生成時にランダムオフセット付与（最大30秒）

### 8.3 Supabase テーブル構成

```
テーブル: chats
├── uuid    (UUID v7, PRIMARY KEY, サーバー自動生成)
├── name    (TEXT)
├── color   (TEXT)
├── message (TEXT)
├── time    (BIGINT, サーバー自動設定)
├── system  (BOOLEAN)
├── email   (TEXT, NULLABLE)
├── ip      (TEXT)
└── ua      (TEXT)
```

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

--font-yui: 'Zen Maru Gothic', 'MS UI Gothic', Arial, sans-serif;
```

### 9.2 コンポーネント構成

| コンポーネント     | 責務                                              |
| ------------------ | ------------------------------------------------- |
| `RetroSplitter`    | 上下ペインのリサイズ可能な分割レイアウト          |
| `ChatRoom`         | メッセージ入力・送信・退室ボタン                  |
| `EntryForm`        | 名前・色・メール入力、入室ボタン                  |
| `ChatLogList`      | メッセージ履歴の仮想スクロール表示（lazy loaded） |
| `ChatMessage`      | 個別メッセージの描画                              |
| `ChatRanking`      | 発言数ランキング表示                              |
| `ParticipantsList` | 直近5分以内の参加者一覧                           |

### 9.3 レスポンシブ対応

- `min-h-dvh` / `h-dvh` でモバイルビューポート対応
- Tailwind CSS のユーティリティクラスによるレスポンシブレイアウト
- `RetroSplitter` による動的なペインサイズ調整

---

## 10. パフォーマンス最適化

### 10.1 ビルド最適化

| 最適化       | 設定                                                        |
| ------------ | ----------------------------------------------------------- |
| コード分割   | Vite の `manualChunks` で vendor 分離（react, supabase 等） |
| Tree Shaking | Rollup `treeshake: 'recommended'`                           |
| 圧縮         | Terser（`console.log` 削除、変数名短縮）                    |
| CSS 圧縮     | Lightning CSS                                               |
| ターゲット   | ES2022                                                      |

### 10.2 ランタイム最適化

| 最適化             | 実装                                               |
| ------------------ | -------------------------------------------------- |
| 遅延読み込み       | `ChatLogList` を `React.lazy()` で分割             |
| 楽観的更新         | `useOptimistic` で即座に UI 反映                   |
| トランジション     | `useTransition` / `startTransition` で低優先度更新 |
| 遅延値             | `useDeferredValue` で参加者リスト計算を遅延        |
| キャッシュ         | API レスポンスの 5分間インメモリキャッシュ         |
| プリロード         | `preloadCriticalResources()` でリソース先読み      |
| パフォーマンス監視 | 3秒超の API 呼び出しを `console.warn` で警告       |

---

## 11. エラーハンドリング・耐障害性

### 11.1 オフライン対応

```
navigator.onLine === false
    → mockChatData を返却（3件のサンプルメッセージ）
    → ネットワーク復旧時に自動再接続（monitorNetworkStatus）
```

### 11.2 認証エラー対応

```
Supabase 401 / JWT エラー
    → mockChatData にフォールバック（サービス継続）
```

### 11.3 リトライ

- 全 API 呼び出しに指数バックオフ付きリトライ（最大3回）
- 最終失敗時のみエラー throw

---

## 12. セキュリティ

| 項目               | 対応                                                      |
| ------------------ | --------------------------------------------------------- |
| 認証               | Supabase Anonymous Auth（セッション非永続化）             |
| API キー           | 環境変数（`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`） |
| UUID プライバシー  | クライアント側 UUID v7 にランダムオフセット（最大30秒）   |
| 入力バリデーション | 名前: 必須、24文字以内                                    |
| 本番ビルド         | `console.log` 削除、ソースマップ無効化                    |

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
chatApi.ts
chatApi.test.ts    ← 同一ディレクトリ
```

---

## 14. CI/CD・デプロイ

### 14.1 CI パイプライン

```yaml
# .github/workflows/ci.yml
トリガー: PR (opened, reopened, synchronize)
  → Node 18 セットアップ
  → pnpm install
  → pnpm test
```

### 14.2 ビジュアルリグレッション

```yaml
# .github/workflows/chromatic.yml
Storybook ビルド → Chromatic にアップロード → 差分検出
```

### 14.3 デプロイ

```bash
pnpm build:prod    # TypeScript コンパイル + Vite ビルド + SEO 最適化
pnpm deploy        # gh-pages で dist/ を GitHub Pages にデプロイ
```

デプロイ先: `https://isrnao.github.io/yui-chat-ts/`

---

## 15. 開発環境

### 15.1 必要な環境変数

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=public-anon-key
```

### 15.2 主要コマンド

| コマンド          | 用途                          |
| ----------------- | ----------------------------- |
| `pnpm dev`        | 開発サーバー起動              |
| `pnpm build`      | プロダクションビルド          |
| `pnpm test`       | テスト実行（1回）             |
| `pnpm watch:test` | テスト監視モード              |
| `pnpm lint`       | ESLint チェック               |
| `pnpm format`     | Prettier フォーマット         |
| `pnpm typecheck`  | TypeScript 型チェック         |
| `pnpm storybook`  | Storybook 起動（port 6006）   |
| `pnpm lighthouse` | Lighthouse パフォーマンス監査 |

### 15.3 コード品質ツール

| ツール     | 設定ファイル        | 主な設定                                    |
| ---------- | ------------------- | ------------------------------------------- |
| ESLint     | `eslint.config.js`  | React Hooks, React Refresh, Prettier 連携   |
| Prettier   | `.prettierrc`       | シングルクォート、100文字幅、セミコロンあり |
| TypeScript | `tsconfig.app.json` | strict モード、パスエイリアス               |
| Lefthook   | `lefthook.yml`      | Git フック（コミット前チェック）            |

### 15.4 パスエイリアス

```typescript
// tsconfig.app.json + vite.config.ts で設定
import { supabase } from '@shared/supabaseClient';
import type { Chat } from '@features/chat/types';
```

| エイリアス    | 実パス           |
| ------------- | ---------------- |
| `@features/*` | `src/features/*` |
| `@shared/*`   | `src/shared/*`   |
