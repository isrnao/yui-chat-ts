# 技術設計ドキュメント: multi-room-chat

## 概要

現在の yui-chat-ts は単一のチャット空間のみを提供している。本仕様では URL パス（例: `/ofall/`、`/superbeginner/`）ごとに**独立したチャットルーム**を表示できるようにする。各ルームは独立したメッセージログを持ち、Realtime 更新も部屋単位で分離する。

GitHub Pages 上の SPA として動作しつつ、直接 URL アクセス・リロード・共有リンクがすべてのルーム URL で機能することを目指す。

あわせて、ROOM_IDS に含まれない未知の URL にアクセスされた場合は、デフォルトルームへのサイレントフォールバックではなく、レガシーチャット（yuichat2）の 404 ページを再現した専用画面（`NotFoundPage`）を表示する。

### 設計方針

- **クライアントサイドルーティングのみ**（サーバー側ルートなし）。GitHub Pages の制約下で動作させるため `404.html` リダイレクトトリックを利用
- **Supabase スキーマ変更を最小限に**: 既存 `chats` テーブルに `room_id TEXT` カラムを1つ追加するだけ
- **ルーム ID はホワイトリスト方式**: URL で任意の文字列を受け付けると自由ルーム作成になってしまうため、クライアントとサーバーの両方で既知のルーム ID のみを受理
- **既存チャット機能はすべて部屋単位で動作**: 設定永続化、アバター、フォントスタイル、look/unlook、おみくじ、論理削除すべて
- **段階的導入**: ルーム未指定時（`/yui-chat-ts/`）はデフォルトルーム（例: `ofall`）にフォールバックし、既存ユーザーへの破壊的変更を避ける
- **未知ルートは 404 表示**: ROOM_IDS に含まれないセグメントや複数セグメントの不正パスは、デフォルトルームへのサイレントフォールバックではなく、レガシー雰囲気の NotFoundPage を明示的に表示する（SEO は `noindex` で制御）
- **レガシーUI互換**: タイトル（「ダーツチャット」「中学生チャット」など）を各ルームで切り替え表示。404 ページも旧サイトの `４０４ＥＲＲＯＲ` レイアウトを再現

## アーキテクチャ

### 全体構成の変更

```mermaid
graph TB
    subgraph "URLルーティング"
        Router[pathname パーサー<br/>/yui-chat-ts/{roomId}/]
        Guard[ルームID ホワイトリスト検証]
        Fallback[404.html → index.html リダイレクト]
    end
    subgraph "React 状態層"
        RoomCtx[RoomContext<br/>現在のroomId]
        useRoom[useRoom フック]
    end
    subgraph "API/データ層"
        CA[chatApi + room_id フィルタ]
        SB[(Supabase chats テーブル<br/>+ room_id カラム)]
        BC[Supabase Realtime Broadcast<br/>chats-broadcast-{roomId}]
        PG[Postgres Changes<br/>filter: room_id=eq.{id}]
    end
    subgraph "UI"
        App[App.tsx + RoomProvider]
        Title[ルーム別タイトル表示]
        EF[EntryForm]
        CR[ChatRoom]
    end

    Router --> Guard
    Guard --> RoomCtx
    Fallback --> Router
    RoomCtx --> useRoom
    useRoom --> CA
    useRoom --> Title
    CA --> SB
    CA --> BC
    CA --> PG
    App --> RoomCtx
```

### レイヤー構成の変更点

| レイヤー     | 変更内容                                                               | 新規/変更ファイル                                                                                   |
| ------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| ルーティング | URL パースとルーム ID 検証、404 分岐、GitHub Pages SPA リダイレクト    | `src/features/room/router.ts`（新規）、`public/404.html`（新規）                                    |
| ルーム定義   | ホワイトリスト・メタデータ（タイトル・説明）                           | `src/features/room/rooms.ts`（新規）                                                                |
| Context      | 現在のルーム情報を配信                                                 | `src/features/room/RoomContext.tsx`（新規）、`src/features/room/useRoom.ts`（新規）                 |
| API 層       | 全クエリに `room_id` フィルタ追加、Broadcast チャネル名を部屋別に      | `src/features/chat/api/chatApi.ts`（変更）                                                          |
| 静的ページ   | GitHub Pages SPA ルーティング対応                                      | `public/404.html`（新規）、`index.html`（変更）                                                     |
| UI           | ルーム名を表示、エントリフォーム・チャットルームタイトル切替、404 分岐 | `App.tsx`（変更）、`EntryForm`（変更）                                                              |
| 404 ページ   | 未知ルートに対するレガシー風エラー画面                                 | `src/features/not-found/components/NotFoundPage/`（新規）、`src/features/not-found/copy.ts`（新規） |
| DDL          | `room_id` カラム追加・インデックス・RLS 更新                           | `docs/migrations/002_add_room_id_column.sql`（新規）                                                |

## ルーム定義（ホワイトリスト）

任意の文字列を URL に含められると以下の問題が起きる：

- 検索エンジンのクローラーが無限に新しいルームを作成できる
- 誤タイプで空のルームに飛ばされる
- ルーム名スパムによる Supabase ストレージの圧迫

クライアントとサーバーの両方で有効なルーム ID を制限する。

```typescript
// src/features/room/rooms.ts

export type RoomId = 'ofall' | 'superbeginner' | 'darts' | 'juniorhighschool3';

export type RoomMeta = {
  id: RoomId;
  title: string; // 画面上部に表示（例: 「超初心者チャット」）
  description: string; // EntryForm 等のサブタイトル
  headerColor?: string; // ピンク背景バーの色（ルームごとのアクセントカラー）
};

export const ROOMS: Record<RoomId, RoomMeta> = {
  ofall: {
    id: 'ofall',
    title: 'ゆいちゃっと',
    description: 'みんなのチャット',
  },
  superbeginner: {
    id: 'superbeginner',
    title: '超初心者チャット',
    description: 'チャットが初めてのひとのためのチャット',
    headerColor: '#feb6c1',
  },
  darts: {
    id: 'darts',
    title: 'ダーツチャット',
    description: 'ダーツ好きが集まるチャット',
  },
  juniorhighschool3: {
    id: 'juniorhighschool3',
    title: '中学生チャット３',
    description: '中学生のためのチャット',
  },
};

export const ROOM_IDS = Object.keys(ROOMS) as RoomId[];
export const DEFAULT_ROOM_ID: RoomId = 'ofall';

export function isRoomId(value: unknown): value is RoomId {
  return typeof value === 'string' && (ROOM_IDS as string[]).includes(value);
}

export function getRoomMeta(id: RoomId): RoomMeta {
  return ROOMS[id];
}
```

**設計判断**:

- `RoomId` は literal union 型で閉じ、コンパイル時に不正値を検出
- 新しいルームを追加する場合は `ROOMS` に1エントリ追加するだけ
- Supabase 側には RLS で `room_id IN (...)` チェックを入れる余地を残す（将来の拡張）

## URL ルーティング（GitHub Pages SPA 対応）

GitHub Pages は静的ホスティングなので `/yui-chat-ts/ofall/` のような URL に直接アクセスすると 404 になる。これを回避するために spa-github-pages トリックを使う。

### ルーティングフロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant GHP as GitHub Pages
    participant Browser as ブラウザ
    participant App as React App

    alt 直接アクセス（例: /yui-chat-ts/darts/）
        User->>GHP: GET /yui-chat-ts/darts/
        GHP->>Browser: 404.html を返す
        Browser->>Browser: 404.html の JS がクエリに変換
        Browser->>GHP: GET /yui-chat-ts/?/darts/
        GHP->>Browser: index.html
        Browser->>App: React 起動
        App->>App: クエリからパスを復元して history.replaceState
        App->>App: roomId=darts でロード
    else ルート（/yui-chat-ts/）
        User->>GHP: GET /yui-chat-ts/
        GHP->>Browser: index.html
        Browser->>App: React 起動
        App->>App: roomId=ofall（デフォルト）
    end
```

### 404.html の内容

`public/404.html` に spa-github-pages の汎用スクリプトを配置する。クエリ文字列にパス情報を埋め込んで `index.html` にリダイレクトする方式。

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>yui-chat-ts</title>
    <script>
      // spa-github-pages: 404 → index.html にリダイレクトしつつパスを保持
      // https://github.com/rafgraph/spa-github-pages (MIT)
      var segmentCount = 1; // /yui-chat-ts/ 部分をベースとして保持
      var l = window.location;
      l.replace(
        l.protocol +
          '//' +
          l.hostname +
          (l.port ? ':' + l.port : '') +
          l.pathname
            .split('/')
            .slice(0, 1 + segmentCount)
            .join('/') +
          '/?/' +
          l.pathname.slice(1).split('/').slice(segmentCount).join('/').replace(/&/g, '~and~') +
          (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
          l.hash
      );
    </script>
  </head>
  <body></body>
</html>
```

### index.html 側の復元スクリプト

`index.html` の `<head>` 先頭に、クエリ文字列をパスに戻すスクリプトを挿入する（React 起動前に実行）。

```html
<script>
  (function () {
    var l = window.location;
    if (l.search[1] === '/') {
      var decoded = l.search
        .slice(1)
        .split('&')
        .map(function (s) {
          return s.replace(/~and~/g, '&');
        })
        .join('?');
      window.history.replaceState(null, '', l.pathname.slice(0, -1) + decoded + l.hash);
    }
  })();
</script>
```

### router.ts: パスのマッチングとルートIDの抽出

ルーティング判定は **全域関数 `matchRoute`** に一本化し、結果を discriminated union `RouteMatch` で返す。これにより「有効なルーム URL」と「未知ルート（NotFound）」を型レベルで区別し、呼び出し側の分岐漏れをコンパイル時に防ぐ。

```typescript
// src/features/room/router.ts

import { ROOM_IDS, DEFAULT_ROOM_ID, isRoomId } from './rooms';
import type { RoomId } from './rooms';

export type RouteMatch =
  | { type: 'room'; roomId: RoomId }
  | { type: 'not-found'; attemptedPath: string };

/**
 * 現在の pathname をアプリルートと照合する。
 *
 * 判定ルール:
 * - BASE_URL 直下（例: `/yui-chat-ts/`）        → { type: 'room', roomId: DEFAULT_ROOM_ID }
 * - BASE_URL + 有効な roomId（例: `/yui-chat-ts/darts/`）
 *                                                → { type: 'room', roomId }
 * - それ以外（例: `/yui-chat-ts/unknown/`、複数セグメント、大文字混入など）
 *                                                → { type: 'not-found', attemptedPath }
 */
export function matchRoute(pathname: string = window.location.pathname): RouteMatch {
  const base = import.meta.env.BASE_URL.replace(/\/$/, ''); // '/yui-chat-ts'
  const withoutBase = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const segments = withoutBase.split('/').filter(Boolean);

  // ルートパス → デフォルトルーム
  if (segments.length === 0) return { type: 'room', roomId: DEFAULT_ROOM_ID };

  // 単一セグメントかつ有効な roomId → 該当ルーム
  if (segments.length === 1 && isRoomId(segments[0])) {
    return { type: 'room', roomId: segments[0] };
  }

  // それ以外はすべて NotFound
  return { type: 'not-found', attemptedPath: pathname };
}

/**
 * 後方互換: `matchRoute` から roomId だけを取り出すユーティリティ。
 * NotFound の場合は DEFAULT_ROOM_ID を返すので、
 * 「とにかくルームIDが欲しい」場面（キャッシュキー生成など）でのみ使用する。
 * ルーティング分岐には使わない。
 */
export function getRoomIdFromPath(pathname: string = window.location.pathname): RoomId {
  const match = matchRoute(pathname);
  return match.type === 'room' ? match.roomId : DEFAULT_ROOM_ID;
}

/** roomId を URL パスに変換（リンク生成用） */
export function buildRoomPath(roomId: RoomId): string {
  return `${import.meta.env.BASE_URL}${roomId}/`;
}
```

**設計判断**:

- `popstate` / `pushState` は使わない（ルーム間の遷移は通常のリンクで `<a href>` による全ページ遷移でも構わない。SPA 内遷移は将来拡張として追加可能）
- **ルート直下のみ** デフォルトルームへフォールバックし、**それ以外の未知パスは明示的に 404** として扱う（NotFoundPage の描画トリガー）
- 判定結果を discriminated union で返すことで、App.tsx 側で `switch (match.type)` の網羅性を TypeScript に保証させる
- `matchRoute` は純粋関数（引数に pathname を取れる）なので、ユニットテスト/PBT で副作用なく検証できる
- クエリパラメータ・ハッシュは pathname には含まれないため、判定に影響しない

## RoomContext と useRoom フック

ルーム情報をコンポーネントツリー全体で共有する。Context API を使う理由は：

- `App.tsx` から `ChatLogList` / `EntryForm` / `ChatRoom` まで深くネストしているため props drilling を避けたい
- 将来的に「ルーム切替」を実装する際に Context 1箇所の更新で済む

ルーティング判定（`matchRoute`）は App のトップレベルで1回だけ行い、その結果が `type === 'room'` のときだけ `RoomProvider` に包む。NotFound 時は Context を張らず、`NotFoundPage`（後述）を直接レンダリングする。

```typescript
// src/features/room/RoomContext.tsx

import { createContext, useMemo, type ReactNode } from 'react';
import { getRoomMeta } from './rooms';
import type { RoomId, RoomMeta } from './rooms';

type RoomContextValue = {
  roomId: RoomId;
  meta: RoomMeta;
};

export const RoomContext = createContext<RoomContextValue | null>(null);

type RoomProviderProps = {
  roomId: RoomId;
  children: ReactNode;
};

export function RoomProvider({ roomId, children }: RoomProviderProps) {
  const value = useMemo<RoomContextValue>(
    () => ({ roomId, meta: getRoomMeta(roomId) }),
    [roomId]
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
```

```typescript
// src/features/room/useRoom.ts

import { useContext } from 'react';
import { RoomContext } from './RoomContext';

export function useRoom() {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used within RoomProvider');
  return ctx;
}
```

**設計判断**:

- `roomId` は props として注入する（マウント時1回、`matchRoute` の結果から決定）。これにより「NotFound のとき Provider を張らない」という方針を型で表現できる
- `useMemo` で value を固定し、不要な再レンダリングを防ぐ
- `useRoom` は Provider の外で呼ばれたら throw する（NotFoundPage はチャット機能を必要としないので、そもそも Provider を消費しない）

## データモデルの変更

### Supabase テーブルスキーマ

```sql
ALTER TABLE chats ADD COLUMN IF NOT EXISTS room_id TEXT NOT NULL DEFAULT 'ofall';
CREATE INDEX IF NOT EXISTS idx_chats_room_time ON chats (room_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_chats_room_uuid ON chats (room_id, uuid DESC);
```

- **`NOT NULL DEFAULT 'ofall'`**: 既存レコードは自動的に `ofall` ルームに割り当てられる
- **複合インデックス `(room_id, time DESC)`**: 「特定ルームの最新 N 件」クエリが高速化
- **複合インデックス `(room_id, uuid DESC)`**: UUID v7 時系列ソート（既存の `order by uuid` を踏襲）

### Chat 型の拡張

```typescript
// src/features/chat/types.ts（変更）

export type Chat = {
  uuid: string;
  name: string;
  color: string;
  message: string;
  time: number;
  client_time?: number;
  optimistic?: boolean;
  system?: boolean;
  email?: string;
  ip: string;
  ua: string;
  metadata?: ChatMetadata;
  room_id: RoomId; // ★追加（必須）
};
```

`room_id` は optional ではなく必須にする。API 層で書き込み時に強制セットし、読み込み時は `.eq('room_id', ...)` でフィルタするので undefined にはならない。

### RLS ポリシー変更

既存の SELECT / INSERT / UPDATE ポリシーは `room_id` を明示的に扱っていないが、以下のように制限を追加すると安全性が向上する：

```sql
-- INSERT 時に許可されたルーム ID のみ受け入れる
DROP POLICY IF EXISTS "public-insert" ON chats;
CREATE POLICY "public-insert" ON chats
  FOR INSERT
  WITH CHECK (room_id IN ('ofall', 'superbeginner', 'darts', 'juniorhighschool3'));
```

ただし、この制限を入れるとルーム追加時に DDL 更新が必要になる。初期実装ではクライアント側のホワイトリストのみで運用し、将来ルームが増減する場合に DDL も同期する。

## chatApi の変更

### 全てのクエリに `room_id` フィルタを追加

```typescript
// src/features/chat/api/chatApi.ts（抜粋）

export async function loadChatLogs(roomId: RoomId, useCache = true): Promise<Chat[]> {
  // ルーム単位でキャッシュを持つ
  const cacheKey = `chats:${roomId}`;
  if (useCache && cacheStore[cacheKey]) {
    /* ... */
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('uuid,name,color,message,time,system,email,ip,ua,metadata,room_id')
    .eq('room_id', roomId) // ★追加
    .eq('deleted', false)
    .order('uuid', { ascending: false })
    .limit(MAX_CHAT_LOG);
  // ...
}

export async function saveChatLogOptimistic(chat: Chat): Promise<Chat> {
  const sanitized = {
    name: chat.name,
    color: chat.color,
    message: chat.message,
    system: chat.system,
    email: chat.email,
    ip: chat.ip,
    ua: chat.ua,
    metadata: chat.metadata ?? null,
    room_id: chat.room_id, // ★追加
  };
  // ...
}

export async function clearChatLogsByName(roomId: RoomId, name: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ deleted: true })
    .eq('room_id', roomId) // ★追加
    .eq('name', name);
  // ...
}
```

### Realtime チャネルを部屋ごとに分離

```typescript
// subscribeChatLogs をルーム単位に変更
export function subscribeChatLogs(roomId: RoomId, callback: (chat: Chat) => void) {
  const channel = supabase
    .channel(`chats-postgres-${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: TABLE,
        filter: `room_id=eq.${roomId}`, // ★ルーム別フィルタ
      },
      (payload) => callback(normalizeChat(payload.new))
    )
    .subscribe();
  return channel;
}

// Broadcast チャネルもルーム別に
function getOrCreateBroadcastChannel(roomId: RoomId): RealtimeChannel {
  if (!broadcastChannels[roomId]) {
    broadcastChannels[roomId] = supabase.channel(`chats-broadcast-${roomId}`);
  }
  return broadcastChannels[roomId];
}

export function broadcastLookEvent(roomId: RoomId, messageId: string): void {
  const channel = getOrCreateBroadcastChannel(roomId);
  ensureBroadcastSubscribed(roomId);
  channel.send({
    type: 'broadcast',
    event: 'look',
    payload: { type: 'look', messageId } satisfies LookEvent,
  });
}
```

**設計判断**:

- Postgres Changes の `filter: 'room_id=eq.X'` で Supabase 側が部屋外のメッセージを自動的に除外する（クライアント側で捨てる必要なし）
- Broadcast のチャネル名を `chats-broadcast-${roomId}` で部屋ごとに分離し、別ルームの look 音声が鳴らないようにする

### キャッシュの分離

現在の `chatLogsCache` はグローバル変数だが、`Record<RoomId, CacheItem>` に変更してルームごとに保持する：

```typescript
const chatLogsCache: Partial<Record<RoomId, CacheItem>> = {};
```

ルームを切り替えるとキャッシュも切り替わる。同じルームに戻った場合は 5 分以内ならキャッシュから復元される。

## UI 変更

### App.tsx（ルーティング分岐）

App.tsx のトップレベルで `matchRoute()` を1回だけ呼び、結果に応じて **RoomProvider 配下のチャット画面** か **NotFoundPage** のどちらをレンダリングするかを決める。分岐は `switch (match.type)` で網羅性を担保する。

```tsx
import { useMemo } from 'react';
import { matchRoute } from '@features/room/router';
import { RoomProvider } from '@features/room/RoomContext';
import NotFoundPage from '@features/not-found/components/NotFoundPage';
// ...

function AppContent() {
  const { meta } = useRoom();
  // ... 既存のロジック（handleEnter/handleSend に roomId を渡す）
}

export default function App() {
  // マウント時に一度だけ現在の pathname を判定する
  const match = useMemo(() => matchRoute(), []);

  switch (match.type) {
    case 'room':
      return (
        <RoomProvider roomId={match.roomId}>
          <AppContent />
        </RoomProvider>
      );
    case 'not-found':
      return <NotFoundPage attemptedPath={match.attemptedPath} />;
  }
}
```

**設計判断**:

- NotFound 時は `RoomProvider` を張らない。これにより、NotFoundPage からチャット API や Realtime 購読が誤って起動しないことを静的に保証する
- `useMemo` でマウント時に1回だけ判定する（ルーム間遷移は `<a href>` によるフルページ遷移でよい、という既存方針を踏襲）
- `switch` 文は TypeScript の網羅性チェックにより、将来 `RouteMatch` にバリアントが追加された場合にコンパイルエラーで気付ける

### タイトル切替

EntryForm と SEO タイトルを `meta.title` に応じて切り替える：

```tsx
// EntryForm
const { meta } = useRoom();
return <header className="mb-1 text-2xl font-bold text-yui-pink font-yui">{meta.title}</header>;

// App.tsx の useSEO
const { meta } = useRoom();
useSEO({
  title: `${meta.title} - 無料お気楽チャット`,
  description: meta.description,
  canonical: `https://isrnao.github.io/yui-chat-ts/${meta.id === 'ofall' ? '' : meta.id + '/'}`,
});
```

### useChatHandlers への roomId 注入

```typescript
const { roomId } = useRoom();

const { handleEnter, ... } = useChatHandlers({
  name, color, email, myId,
  roomId,  // ★追加
  entered, setEntered, /* ... */
});
```

`useChatHandlers` 内部では `createOptimisticChat` で `room_id: roomId` を設定し、`saveChatLogOptimistic`・`clearChatLogsByName`・`broadcastLookEvent` 等にもすべて roomId を渡す。

## コンポーネント間のデータフロー

```mermaid
sequenceDiagram
    participant Browser as ブラウザ
    participant Router as router.ts
    participant Provider as RoomProvider
    participant App as App.tsx
    participant UCH as useChatHandlers
    participant API as chatApi
    participant SB as Supabase

    Note over Browser: /yui-chat-ts/darts/ にアクセス
    Browser->>Router: getRoomIdFromPath('/yui-chat-ts/darts/')
    Router-->>Provider: roomId='darts'
    Provider->>App: Context 経由で roomId を配信
    App->>UCH: useChatHandlers({ roomId: 'darts', ... })

    Note over App: 初回ロード
    App->>API: loadChatLogs('darts')
    API->>SB: SELECT ... WHERE room_id='darts' AND deleted=false
    SB-->>API: darts の過去ログ
    API-->>App: chatLog
    App->>API: subscribeChatLogs('darts', mergeChat)
    API->>SB: channel('chats-postgres-darts').on('postgres_changes', filter: 'room_id=eq.darts')

    Note over App: 発言
    App->>UCH: handleSend(msg, metadata)
    UCH->>API: saveChatLogOptimistic({ ..., room_id: 'darts' })
    API->>SB: INSERT (room_id='darts')
    SB-->>API: Realtime INSERT 通知
    API-->>App: mergeChat (他ルームでは受信しない)
```

## 404 ページ（NotFoundPage）

存在しない URL（例: `/yui-chat-ts/unknown-room/`、`/yui-chat-ts/ofall/extra/segment/`、`/yui-chat-ts/OFALL/` など ROOM_IDS に含まれないセグメント）へのアクセス時に、レガシー `404.html` の雰囲気を再現した専用画面を表示する。

**参考とするレガシー HTML の要素**（本機能で再現する対象）:

- 全角タイトル「４０４ＥＲＲＯＲ」
- 顔文字 AA `⌒⊂´∀｀)つ`
- 「お気楽チャットにもどる」リンク（**本プロジェクトではアプリのエントリパス `BASE_URL` に置き換える**）
- 英文の本文（「The file you just requested wasn't found ...」）

**再現対象外**（レガシー HTML に含まれるが、本プロジェクトではスコープ外）:

- Google AdSense（広告）
- Google Analytics（解析タグ）— サイト全体の GA は `index.html` に既存のため、このページ固有の追加は行わない
- Wayback Machine の翻訳ウィジェット
- 「最近の記事一覧」等の外部ブログ由来ブロック

### 配置方針

feature-first 構成に従い、チャット本体とは独立した新 feature として切り出す。`shared/` ではなく `features/` にする理由は、404 表示はアプリ固有のドメイン関心事（レガシー UI 再現）であり、汎用コンポーネントではないため。

```
src/features/not-found/
├── components/
│   └── NotFoundPage/
│       ├── index.tsx
│       ├── NotFoundPage.test.tsx
│       └── NotFoundPage.stories.tsx
└── copy.ts    // タイトル・AA・本文など文字列定数
```

Router から直接参照されるのは `NotFoundPage` のみ。チャット側の feature（`features/chat`、`features/room`）には依存しない（`BASE_URL` のみ `import.meta.env` 経由で参照）。

### コンポーネント設計

```tsx
// src/features/not-found/components/NotFoundPage/index.tsx

import { useEffect } from 'react';
import { useSEO } from '@shared/hooks/useSEO';
import { NOT_FOUND_COPY } from '@features/not-found/copy';

type NotFoundPageProps = {
  /** 404 を発生させた元のパス。ログ・テレメトリ用途。表示には使わない */
  attemptedPath?: string;
};

export default function NotFoundPage({ attemptedPath }: NotFoundPageProps) {
  // SEO: タイトルを 404 用に差し替え、検索結果への混入を防ぐ
  useSEO({
    title: `${NOT_FOUND_COPY.title} - ${NOT_FOUND_COPY.siteName}`,
    description: NOT_FOUND_COPY.description,
    robots: 'noindex, nofollow', // ★useSEO 側で新規対応が必要（後述）
  });

  // HTTP ステータスは静的ホスティングの都合上返せないため、
  // document.title と noindex メタタグで 404 であることを明示する
  useEffect(() => {
    if (attemptedPath) {
      // eslint-disable-next-line no-console
      console.info('[404]', attemptedPath);
    }
  }, [attemptedPath]);

  return (
    <main
      className="flex flex-col items-center min-h-dvh bg-yui-green/10 font-yui px-[var(--page-gap)] py-8"
      role="main"
    >
      <h1 className="text-3xl font-bold text-yui-pink mb-2 tracking-widest">
        {NOT_FOUND_COPY.title}
      </h1>

      {/* 顔文字 AA は視覚装飾なので aria-hidden でスクリーンリーダーから隠す */}
      <p className="text-2xl mb-6 select-none" aria-hidden="true">
        {NOT_FOUND_COPY.aa}
      </p>

      <nav aria-label="ナビゲーション" className="mb-6">
        <a
          href={import.meta.env.BASE_URL}
          className="text-blue-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-yui-pink"
        >
          {NOT_FOUND_COPY.homeLinkLabel}
        </a>
      </nav>

      <section aria-labelledby="not-found-description" className="max-w-prose text-sm leading-6">
        <h2 id="not-found-description" className="sr-only">
          エラーの詳細
        </h2>
        <p>{NOT_FOUND_COPY.bodyEn}</p>
      </section>
    </main>
  );
}
```

**`useSEO` 拡張の必要性**:

現行の `src/shared/hooks/useSEO.ts` の `UseSEOOptions` は `robots` フィールドを持たない。本機能では `NotFoundPage` 向けに `robots: 'noindex, nofollow'` を指定したいので、次の最小拡張が必要:

```typescript
// src/shared/hooks/useSEO.ts に追加
export interface UseSEOOptions {
  // ... 既存フィールド
  robots?: string; // 例: 'noindex, nofollow'
}

// useSEO 内部で meta[name="robots"] を upsert する処理を追加
```

拡張しない場合のフォールバックとして、`NotFoundPage` 内で直接 `useEffect` から `meta[name="robots"]` を操作することも可能だが、SEO 関心事は `useSEO` に集約する方針（既存設計の一貫性）を優先する。

```typescript
// src/features/not-found/copy.ts

/**
 * NotFoundPage で表示する文字列は定数として切り出し、
 * 正当性プロパティ（タイトル・本文の完全一致）を PBT/ユニットテストから検証できるようにする。
 */
export const NOT_FOUND_COPY = {
  siteName: 'ゆいちゃっとTS',
  title: '４０４ＥＲＲＯＲ', // 全角
  aa: '⌒⊂´∀｀)つ',
  homeLinkLabel: 'お気楽チャットにもどる',
  description: 'ページが見つかりませんでした。',
  bodyEn:
    "The file you just requested wasn't found in the location (or with the name) specified. " +
    'You may have an incorrect URL, or the file may have been moved or renamed. ' +
    "Try navigating to the content you're seeking by using the links on this page, " +
    'or by searching the site with the form on this page. Most recent entries are listed below.',
} as const;
```

### props の責務

| prop            | 必須 | 用途                                                                                   |
| --------------- | ---- | -------------------------------------------------------------------------------------- |
| `attemptedPath` | 任意 | 404 を引き起こした元パス。`console.info` での観測用。UI への描画・ユーザー露出はしない |

**意図**:

- ユーザーが不安にならないよう、入力した不正な URL はページ上に表示しない（レガシーも表示していない）
- `console.info` レベルに留めることで、開発者が DevTools から 404 発生を気付ける

### 「お気楽チャットにもどる」リンクの遷移先

`import.meta.env.BASE_URL`（= GitHub Pages の場合 `/yui-chat-ts/`）を指す。`BASE_URL` 直下は `matchRoute()` で `{ type: 'room', roomId: DEFAULT_ROOM_ID }` に解決されるため、結果として **EntryForm（入室前）または ChatRoom（入室済み localStorage 復元）にランディング** する。

ハードコードされた相対パス（`/`、`/yui-chat-ts/` など）を使わず `import.meta.env.BASE_URL` を使う理由は、開発時（`/`）・本番（`/yui-chat-ts/`）の差異を Vite の環境変数に委譲するため。

### スタイリング方針

既存の `src/styles/theme.css` に定義済みのトークンを流用し、新しい色・フォントは追加しない。

| 要素             | クラス                             | 狙い                                                   |
| ---------------- | ---------------------------------- | ------------------------------------------------------ |
| ルート `<main>`  | `bg-yui-green/10`、`font-yui`      | ChatLogPage と同じ淡い緑＋レトロフォントで世界観を統一 |
| タイトル `<h1>`  | `text-yui-pink`、`tracking-widest` | 全角タイトルのレトロ感を出す                           |
| AA `<p>`         | `select-none`、`aria-hidden`       | コピー不可の視覚装飾として扱う                         |
| 戻るリンク       | `text-blue-700 underline`          | 古典的 HTML アンカーの見た目                           |
| 本文 `<section>` | `max-w-prose`、`text-sm leading-6` | 英文の可読性確保                                       |

**レガシー雰囲気を保つための Do / Don't**:

- **Do**: 全角タイトル、顔文字 AA、青下線リンク、シンプルなブロックレイアウト、余計な装飾なし
- **Don't**: モーダル・トースト・アニメーション・ローディングスピナー・ヒーロー画像（レガシー HTML にない要素は追加しない）

### アクセシビリティ

- **見出し階層**: `<h1>` は「４０４ＥＲＲＯＲ」1個のみ。「エラーの詳細」は `<h2 className="sr-only">` でスクリーンリーダーにのみ公開
- **AA の読み上げ**: `aria-hidden="true"` を付け、スクリーンリーダーから除外。顔文字の音声読み上げは冗長でユーザー体験を損なうため
- **リンクのフォーカス可視化**: `focus-visible:outline-2 focus-visible:outline-yui-pink` でキーボード操作時の現在位置を明示
- **ランドマーク**: `<main>` と `<nav aria-label="ナビゲーション">` でページ構造を明確化
- **言語属性**: HTML ルートの `lang="ja"` を継承。英文本文は段落に埋め込むがスクリーンリーダーの切替は行わない（レガシー踏襲）
- **robots**: `useSEO({ robots: 'noindex, nofollow' })` で検索結果への混入を防ぐ

### データフロー

```mermaid
sequenceDiagram
    participant Browser as ブラウザ
    participant GHP as GitHub Pages
    participant SPA as SPA リダイレクト<br/>(public/404.html)
    participant Index as index.html
    participant App as App.tsx
    participant Router as matchRoute()
    participant NF as NotFoundPage

    User->>GHP: GET /yui-chat-ts/unknown-room/
    GHP->>Browser: 404.html を返す
    Browser->>SPA: 404.html スクリプト実行
    SPA->>Browser: /yui-chat-ts/?/unknown-room/ にリダイレクト
    Browser->>GHP: GET /yui-chat-ts/?/unknown-room/
    GHP->>Browser: index.html
    Browser->>Index: 復元スクリプトが pathname を /yui-chat-ts/unknown-room/ に戻す
    Index->>App: React 起動
    App->>Router: matchRoute('/yui-chat-ts/unknown-room/')
    Router-->>App: { type: 'not-found', attemptedPath }
    App->>NF: <NotFoundPage attemptedPath=... />
    Note over NF: useSEO({ robots: 'noindex, nofollow' })<br/>チャット API は呼ばれない
```

### 404 ページは Supabase / Realtime に触れない

NotFoundPage は `RoomProvider` 配下にない。したがって:

- `loadChatLogs` / `subscribeChatLogs` / Broadcast の購読は起動しない
- localStorage の設定復元（`useSettings`）も実行されない
- 不要なネットワークリクエストが発生しないため、404 の描画は軽量

これは「404 で誤って部屋メッセージを load し、DEFAULT_ROOM に書き込みが漏れる」といった副作用を構造的に防ぐ。

### Property 1: ルームIDの正規化

任意の pathname 入力に対して、`getRoomIdFromPath(pathname)` の戻り値は **必ず** ROOM_IDS に含まれるいずれかの値になる。不正値は DEFAULT_ROOM_ID にフォールバックされる。

**Validates: Requirements 1.1, 1.2**

### Property 2: メッセージの部屋境界

特定のルーム `A` で `loadChatLogs(A)` を呼んだ結果のすべてのメッセージは `msg.room_id === A` を満たす。

**Validates: Requirements 2.1**

### Property 3: Realtime 通知の部屋境界

ルーム `B` で発言された新規メッセージは、ルーム `A` で subscribe している `subscribeChatLogs(A, callback)` のコールバックに渡されない。

**Validates: Requirements 2.2, 2.3**

### Property 4: RoomProvider のラウンドトリップ

`RoomProvider` 内で `useRoom()` を呼ぶと、常に `getRoomIdFromPath()` と同じ roomId が返る。

**Validates: Requirements 1.3**

### Property 5: URL 生成・パースのラウンドトリップ

任意の `RoomId` に対して、`getRoomIdFromPath(buildRoomPath(id))` は `id` と等しい。

**Validates: Requirements 1.4**

### Property 6: 未知パスは必ず NotFound に解決される

`ROOM_IDS` に含まれない任意の文字列 `s`（空文字・大小文字違い・複数セグメントを含む）について、
`matchRoute(BASE_URL + s + '/').type === 'not-found'` が常に成り立つ。

**Validates: 404 要件 1（未知ルートに対して必ず NotFoundPage が描画される）**

### Property 7: NotFoundPage の戻りリンクは常にエントリパスを指す

任意の `attemptedPath` について、`NotFoundPage` を render した結果に含まれる「お気楽チャットにもどる」リンクの `href` は常に `import.meta.env.BASE_URL` と等しい。

**Validates: 404 要件 3（「もどる」リンクが常にアプリのエントリパスを指す）**

### Property 8: NotFoundPage のコピーは定数と完全一致する

`NotFoundPage` がレンダリングする DOM には、以下が**すべて**文字列として含まれる。

- `NOT_FOUND_COPY.title`（`'４０４ＥＲＲＯＲ'`、全角）
- `NOT_FOUND_COPY.aa`（`'⌒⊂´∀｀)つ'`）
- `NOT_FOUND_COPY.homeLinkLabel`（`'お気楽チャットにもどる'`）
- `NOT_FOUND_COPY.bodyEn`（レガシー英文本文と文字列一致）

**Validates: 404 要件 6（タイトル・本文テキストが所定の文字列と一致する）**

### Property 9: NotFoundPage は Supabase / Realtime に触れない

`NotFoundPage` を render している間、`supabase.from(...)` / `supabase.channel(...)` は一度も呼ばれない。

**Validates: 404 の副作用分離（RoomProvider 配下でないことによる構造的保証）**

## エラーハンドリング

| シナリオ                                            | 対応                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 不明なルームIDを含む URL にアクセス                 | `matchRoute` が `{ type: 'not-found' }` を返し、`NotFoundPage` を表示（`RoomProvider` は張らない）                         |
| 複数セグメントの不正パス（例: `/ofall/extra/`）     | 同上（NotFoundPage）                                                                                                       |
| 大文字混入（例: `/OFALL/`）                         | 同上（NotFoundPage、`isRoomId` は厳密一致）                                                                                |
| 404.html のリダイレクトスクリプト実行前にリロード   | SPA ルートの `/yui-chat-ts/` に着地し、DEFAULT_ROOM_ID で起動                                                              |
| Supabase が旧スキーマ（room_id カラムなし）を返す   | `normalizeChat` で `room_id` が欠落している行は `DEFAULT_ROOM_ID` で補完                                                   |
| ルーム間を URL バーから移動した直後の Realtime 購読 | 旧チャネルを `unsubscribe()` し、新しい roomId で再購読                                                                    |
| localStorage 設定が別ルームで復元される             | 設定（名前・色・アバター）はルーム共通でOK。将来ルーム別にする場合は `yui-chat-settings:${roomId}` キーで分離              |
| NotFoundPage から戻った後の状態                     | 戻るリンクは `<a href={BASE_URL}>` によるフルページ遷移。React state はリセットされるが、localStorage からの復元は行われる |

## テスト戦略

| テスト対象                 | テスト種別           | 備考                                                                                                                |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `rooms.ts` / `router.ts`   | ユニット + PBT       | Property 1, 5（ラウンドトリップ）、Property 6（`matchRoute` が未知パスで必ず NotFound）                             |
| `chatApi` の部屋フィルタ   | ユニット             | モックで `.eq('room_id', ...)` が呼ばれることを検証                                                                 |
| `RoomProvider` / `useRoom` | コンポーネント       | Property 4                                                                                                          |
| `ChatLogList`              | コンポーネント       | 異なる roomId を渡したとき、渡された chatLog がそのまま表示される                                                   |
| `NotFoundPage`             | コンポーネント + PBT | Property 7（戻るリンクの href）、Property 8（コピー完全一致）、Property 9（Supabase モックが呼ばれないこと）        |
| `App.tsx` の分岐           | 統合                 | `history.pushState` で未知パスに切り替え → NotFoundPage が描画され、`supabase` のモックが一度も呼ばれないことを確認 |
| `404.html` リダイレクト    | 手動 E2E             | GitHub Pages 環境では実際のデプロイ後に確認                                                                         |

## 互換性・マイグレーション

### 既存ユーザーへの影響

- `/yui-chat-ts/` への直接アクセスは、これまでと同じ動作（デフォルトルーム = `ofall`）
- 過去のメッセージは DDL により全て `room_id = 'ofall'` として扱われる
- 既存の localStorage 設定はそのまま利用可能（ルーム共通）

### ロールアウト手順

1. **Supabase マイグレーション適用**: `002_add_room_id_column.sql` を実行（既存レコードは `ofall` に割り当て）
2. **コードデプロイ**: 新コードがリリースされるまでは、旧コードが `ofall` にのみ書き込む状態でも整合する
3. **`404.html` の配置確認**: GitHub Pages 反映後、`/yui-chat-ts/darts/` に直接アクセスして動作確認
4. **ルーム名の告知**: README や特集ページから各ルームへのリンクを張る（任意）
