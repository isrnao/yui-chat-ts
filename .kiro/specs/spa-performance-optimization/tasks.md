# 実装計画: spa-performance-optimization

> [!IMPORTANT]
> **本 spec は [`top-and-transition-performance`](../top-and-transition-performance/tasks.md) に引き継がれた。**
> 現行コード（React 19.2 / React Compiler 有効 / Vite 8）と乖離しているため、下記の状態表記は
> 実態と一致しない箇所がある。着手前に必ず後継 spec を参照すること。
>
> | Task                              | 表記  | 実態                                                                        |
> | --------------------------------- | ----- | --------------------------------------------------------------------------- |
> | Task 1 ルート単位 Code Splitting  | `[x]` | **未反映**。`LazyRouteHost` / `RouteErrorBoundary` は現行 main に存在しない |
> | Task 6 chatLogResource dedupe     | `[ ]` | **実装済み**（`chatLogResource.ts` に in-flight Map あり）                  |
> | Task 7 realtimeChannelRegistry    | `[ ]` | **実装済み**（`chatApi.ts` に refcount registry あり）                      |
> | Task 8 useChatHandlers 参照安定化 | `[ ]` | React Compiler 導入により**不要化**                                         |
> | Task 11 TopPage 段階描画 + 先読み | `[ ]` | 後継 spec が引き継ぐ                                                        |

## 概要

SPA パフォーマンス改善の 11 Requirement を 7 PR に分割して段階実装する。**最初に Route Code Splitting の骨組み（R1 + R10 + R11）を入れ**、以後の細かい改善は `routes/ChatRoute.tsx` 内に差分を閉じてレビューしやすくする。

## 推奨実装順序（PR 単位）

1. **PR1**: Task 1 + Task 2 + Task 3 (R1 + R10 + R11) — Route 単位 lazy + LazyRouteHost + RouteErrorBoundary + `index.html` 静的ヒント
2. **PR2**: Task 4 + Task 5 (R3 + R4) — ChatLogList 派生値メモ化、useParticipants 修正、ParticipantsList timer 内製化
3. **PR3**: Task 6 (R5) — chatLogResource 統合 + in-flight dedupe
4. **PR4**: Task 7 (R6) — realtimeChannelRegistry + 段階起動
5. **PR5**: Task 8 (R7) — useChatHandlers の identityRef 化
6. **PR6**: Task 9 + Task 10 (R2 + R9) — Container 化、RetroSplitter memo、ChatRoom から chatLog prop 削除
7. **PR7**: Task 11 (R8) — TopPage 段階描画 + Room_Prefetcher（必要に応じて ChatPage 初回 30 件表示 + 背景 100 件補完を含む）

## Tasks

- [x] 1. ルート単位の Code Splitting と物理移動（Requirement 1）
  - [x] 1.1 `src/routes/TopRoute.tsx` を新規作成し、`@features/top/TopPage` をデフォルト export として再 export する
    - _Requirements: 1.1_
  - [x] 1.2 `src/routes/ChatRoute.tsx` を新規作成し、現 `App.tsx` の `ChatPage` 関数本体（roomId 受け取り → useChatLog → useChatHandlers → RetroSplitter 配置まで）を**そのまま**移植する
    - この PR では state 構造（name/color/email/message/windowRows などを shell に持つ既存形）は変更しない
    - useSEO / usePageView / preloadCriticalResources / earlyDataFetch の呼び出しもこちら側に移す（preloadCriticalResources は Task 3 で削除）
    - _Requirements: 1.1, 1.2_
  - [x] 1.3 `src/routes/ChanariRoute.tsx` を新規作成し、`@features/chanari-chat/ChanariChatPage` のラッパー（roomId prop を渡すだけ）とする
    - _Requirements: 1.1_
  - [x] 1.4 `src/routes/NotFoundRoute.tsx` を新規作成し、`./pages/NotFoundPage` のラッパーとする
    - _Requirements: 1.1_
  - [x] 1.5 `src/shared/components/LazyRouteHost.tsx` を新規作成する
    - `useState<LazyExoticComponent<...>>` で lazy 参照を保持
    - `onRetry` 時に `setComponent(lazy(factory))` で再生成
    - `<RouteErrorBoundary onRetry={handleRetry}><Suspense fallback={...}><Component /></Suspense></RouteErrorBoundary>` 構造
    - props は generic `<P>` で型安全に受け渡し
    - _Requirements: 1.1, 10.1, 10.4, 10.5_
  - [x] 1.6 `src/App.tsx` を最小形に書き換える
    - `resolveRoute` と `useEffect(popstate)` / `useEffect(redirect)` のみを残す
    - 4 つの Route を `LazyRouteHost` で配置（`route.type` 分岐）
    - `useChatLog` / `useParticipants` / `useChatHandlers` / `useLookSound` / `EntryForm` / `ChatRoom` / `RetroSplitter` / `ChatRanking` / `ChatLogList` / `TopPage` / `NotFoundPage` / `ChanariChatPage` の直接 import を**全削除**
    - `preloadCriticalResources` / `earlyDataFetch` の import も削除
    - `redirect` 処理は既存仕様を維持
    - _Requirements: 1.1, 1.2, 1.5_
  - [x] 1.7 `vite.config.ts` の `manualChunks` を再確認し、新ルートが期待通り別チャンクになることを確認する
    - 必要に応じて `routes-chat` / `routes-top` などの命名を追加
    - _Requirements: 1.3_
  - [x]\* 1.8 ビルド成果物を検証する
    - `pnpm build` 後、`dist/assets/index-*.js` のエントリチャンクに chat 関連の関数名（`useChatLog`, `EntryForm`, `ChatRoom`, `useParticipants`, `useChatHandlers`, `prefetchChatLogs`, `isRoomId`）が含まれないことを `grep` で確認
    - `dist/index.html` の `<link rel="modulepreload">` リストに `vendor-supabase-*.js` は残ってよい（Non-Goals 参照）
    - _Requirements: 1.3, 1.4_

- [x] 2. Lazy ルートの ErrorBoundary（Requirement 10）
  - [x] 2.1 `src/shared/components/RouteErrorBoundary.tsx` を新規作成する
    - class component で実装し、外部ライブラリ非依存
    - `props.onRetry?: () => void` を受け取る
    - `isChunkLoadError` ヘルパーで `ChunkLoadError` / `Failed to fetch dynamically imported module` / `Loading chunk * failed` / `Importing a module script failed` を判定
    - チャンクエラー時は「再試行」ボタンを含むフォールバック UI、押下で `setState({ error: null })` + `props.onRetry?.()`
    - 通常 render error 時は「トップへ戻る」リンク（`import.meta.env.BASE_URL` 先）を含むフォールバック UI
    - スタイリングは Tailwind CSS のみ（追加 CSS チャンク不要）
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7, 10.8_
  - [x] 2.2 各 lazy ルートが `LazyRouteHost` 経由で個別 `RouteErrorBoundary` でラップされていることを確認する
    - Task 1.5 / 1.6 と同期。複数 Route が同一 boundary を共有しないこと
    - _Requirements: 10.2_
  - [x]\* 2.3 `RouteErrorBoundary.test.tsx` を作成する
    - `ChunkLoadError` を投げる子で再試行ボタンが表示される
    - 再試行ボタン押下で `onRetry` が 1 回呼ばれ、内部 `error` state が null に戻る
    - 通常の render error では「トップへ戻る」リンクが表示される
    - _Requirements: 10.3, 10.4, 10.6_
  - [x]\* 2.4 `LazyRouteHost.test.tsx` を作成する
    - 失敗 → 再試行で `lazy(factory)` が 2 回呼ばれる（factory spy で検証）
    - 成功時に factory が 1 回だけ呼ばれる
    - _Requirements: 10.5_

- [x] 3. index.html の静的プリコネクトと modulePreload 整理（Requirement 11）
  - [x] 3.1 `index.html` の `<head>` に静的ヒントを追加する
    - `<link rel="dns-prefetch" href="https://tklxdjqlvwntdsfxfcwo.supabase.co" />`
    - `<link rel="preconnect" href="https://tklxdjqlvwntdsfxfcwo.supabase.co" crossorigin />`
    - _Requirements: 11.1_
  - [x] 3.2 `usePreloadChatLogs.ts` の `preloadCriticalResources` 関数を削除する
    - 呼び出し側（Task 1.2 で移植した `routes/ChatRoute.tsx`）からも `useEffect(() => preloadCriticalResources(), [])` を削除する
    - _Requirements: 11.2, 11.6_
  - [x] 3.3 不要な `<link rel="preload">` がないことを確認する
    - `index.html` 内のフォント・画像 preload を見直し、現状不要なものは削除
    - _Requirements: 11.5_
  - [x]\* 3.4 ビルド検証
    - `dist/index.html` に `<link rel="preconnect" ... crossorigin>` が含まれる
    - `<link rel="modulepreload">` が initial chunk について生成されている
    - _Requirements: 11.3, 11.4_

- [x] 4. ChatLogList の派生値メモ化と sort 除去（Requirement 3）
  - [x] 4.1 `ChatLogList/index.tsx` から `sortChatsByTime([...chatLog])` 呼び出しを削除し、`chatLog.slice(0, windowRows)` の派生だけにする
    - `useMemo(() => chatLog.slice(0, windowRows), [chatLog, windowRows])` に置き換える
    - `participants` プロップを廃止し、コンポーネント内で `useParticipants(chatLog)` を呼ぶ
    - `currentTime` プロップを廃止し、ParticipantsList 側で内製の timer から取得する形に変える
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 4.2 `ChatLogList` をデフォルト export 時に `React.memo` でラップする
    - _Requirements: 3.4_
  - [x] 4.3 `ChatMessage` を `React.memo` でラップする
    - shallow compare で十分なので比較関数は不要
    - _Requirements: 3.5_
  - [x] 4.4 `src/features/chat/hooks/useNowMinute.ts` を新規作成する
    - `setTimeout` で次の分境界まで待ってから 60_000ms 間隔で `setNow(Date.now())`
    - cleanup で `clearTimeout` / `clearInterval`
    - _Requirements: 3.7_
  - [x] 4.5 `ParticipantsList` を `useNowMinute()` 内製に変更し、`currentTime` プロップを削除する
    - `formatTime(now).slice(0, 5)` で `[HH:MM]` 表示
    - _Requirements: 3.7_
  - [x] 4.6 `useChatLog` の `useOptimistic` reducer に temp ↔ savedChat dedup を追加する
    - reducer の冒頭で `chat.uuid.startsWith('temp-')` の場合のみ、base state（chatLog）に同一 `client_time + name` のエントリが存在するか確認し、あれば prepend を抑制
    - `mergeChat` は変更しない（chatLog は server UUID のみ保持する既存挙動を維持）
    - これにより saveChatLogOptimistic 応答前に realtime INSERT が savedChat を届けた場合でも、temp と savedChat の同時表示を防ぐ
    - _Requirements: 3.6_
  - [x]\* 4.7 `useChatLog.test.ts` に dedup テストを追加する
    - 楽観的更新で `temp-*` UUID のチャットが配列先頭に来ること（base 単体）
    - 同一 `client_time + name` の savedChat が base に届くと temp 行が optimisticLog から消えること（重複表示防止）
    - savedChat の realtime INSERT 二度受信が idempotent であること（mergeChat の findIndex 動作）
    - _Requirements: 3.6_
  - [x] 4.8 `routes/ChatRoute.tsx`（旧 ChatPage）の `useParticipants` 呼び出し・`participants` prop 受け渡しを削除する
    - ChatLogList が内部で持つようになるため、shell から渡さない
    - _Requirements: 3.4_
  - [x]\* 4.9 `ChatLogList.test.tsx` に「同じ chatLog 参照では再計算されない」テストを追加
    - React.Profiler で commit 回数を確認、または `slice` を spy で計測
    - _Requirements: 3.3_
  - [x]\* 4.10 `useNowMinute.test.ts` を作成する
    - 初期値が `Date.now()` 近傍であること
    - 60 秒経過で `setState` が呼ばれること（vi.useFakeTimers）
    - _Requirements: 3.7_

- [x] 5. useParticipants の defer + memo 化（Requirement 4）
  - [x] 5.1 `useParticipants.ts:51` を `useDeferredValue(chatLog)` → `useMemo` の順序に修正する
    - 既存の `getRecentParticipants` 純関数はそのまま流用
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 5.2 公開シグネチャ互換を確認
    - 既存呼び出し側との型互換性（Task 4.1 と同期）
    - _Requirements: 4.4_
  - [x]\* 5.3 `useParticipants.test.ts` に「chatLog 参照不変なら getRecentParticipants が再実行されない」テストを追加
    - `getRecentParticipants` を spy で包み、呼び出し回数を確認
    - _Requirements: 4.2, 4.3_

- [ ] 6. chatLogResource: 取得の dedupe と API 一本化（Requirement 5）
  - [ ] 6.1 `src/features/chat/api/chatLogResource.ts` を新規作成する
    - `MAX_CHAT_LOG = 100` 定数を内部に持つ（既存 `chatApi.ts:10` から移植）
    - `cache: Map<RoomId, CacheEntry>` を保持（既存 5 分 TTL 維持）
    - `snapshotInflight: Map<RoomId, Promise<Chat[]>>` — canonical snapshot 用、roomId 単独キー
    - `pagingInflight: Map<string, Promise<Chat[]>>` — `offset > 0` 用、キーは `${roomId}|${offset}|${limit}` 文字列
    - `fetchSnapshot(roomId)` private 関数: 常に `MAX_CHAT_LOG=100` 件で Supabase 取得（limit パラメータ非対応）
    - `fetchPage(roomId, offset, limit)` private 関数: `offset > 0` の独立クエリ専用
    - 公開 API:
      - `loadChatLogs(roomId)`: canonical snapshot を返す。`snapshotInflight` で dedup
      - `loadChatLogsWithPaging(roomId, offset, limit)`: `offset === 0 && limit <= MAX_CHAT_LOG` は `loadChatLogs` の結果から `slice(0, limit)`、`offset > 0` は `pagingInflight` 経由で独立クエリ
      - `loadInitialChatLogs(roomId)`: `loadChatLogs` のエイリアス
      - `prefetchChatLogs(roomId)`: 結果を捨てつつキャッシュ充填
      - `invalidateCache(roomId)` / `applyOptimisticToCache(roomId, chat)`
    - 既存 `retryApiCall` の指数バックオフは `fetchSnapshot` / `fetchPage` 内に移植
    - 成功・失敗いずれでも該当 in-flight Map エントリを削除
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_
  - [ ] 6.2 `chatApi.ts` の `loadChatLogs` / `loadChatLogsWithPaging` / `loadInitialChatLogs` を `chatLogResource` への薄いラッパーに置き換える
    - 既存 export シグネチャは維持し、呼び出し側の変更を不要にする
    - _Requirements: 5.6_
  - [ ] 6.3 `usePreloadChatLogs.ts` の `earlyDataFetch` を削除し、`chatLogResource.prefetchChatLogs` の再 export または直接利用に置き換える
    - 呼び出し側は後続 Task で更新
    - _Requirements: 5.1, 5.3_
  - [ ] 6.4 `routes/ChatRoute.tsx` の `useEffect(() => earlyDataFetch(roomId), [roomId])` を削除する
    - dedupe は `loadChatLogs` 側で行うため不要に
    - _Requirements: 5.1_
  - [ ]\* 6.5 `chatLogResource.test.ts` を作成する
    - 同一 roomId への並行 `loadChatLogs` 呼び出しで Supabase mock が 1 回のみ呼ばれる
    - `loadChatLogs(roomId)` と `loadChatLogsWithPaging(roomId, 0, 50)` を並行で呼んでも Supabase mock が 1 回のみ、`loadChatLogsWithPaging` は 50 件で resolve する
    - `loadChatLogsWithPaging(roomId, 100, 50)` は独立クエリを発行し、`snapshotInflight` とは別 in-flight キーで dedup される
    - エラー時に in-flight から削除される
    - キャッシュヒット時はネットワークを呼ばない
    - TTL 切れで再フェッチする
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.8, 5.9_

- [ ] 7. realtimeChannelRegistry: チャネル共有と段階起動（Requirement 6）
  - [ ] 7.1 `src/features/chat/api/realtimeChannelRegistry.ts` を新規作成する
    - roomId 単位の `Map<RoomId, Entry>` で `channel` / `listeners: Set` / `refCount` を管理
    - `subscribeChatLogs(roomId, listener): () => void` を export
    - refCount=0 時に `supabase.removeChannel` を呼んで cleanup
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ] 7.2 既存 `chatApi.ts` の `subscribeChatLogs` を `realtimeChannelRegistry` から再 export する形に変える
    - 既存呼び出し側（`useChatLog.ts`）のシグネチャ互換を維持
    - `useChatLog` 側の cleanup を `channel.unsubscribe()` から「registry から得た解除関数を呼ぶ」に変更
    - _Requirements: 6.1, 6.2_
  - [ ] 7.3 `useChatLog.ts` の `useEffect` を first paint 後に realtime 購読する形に変える
    - `requestIdleCallback` を優先、無ければ `setTimeout(fn, 0)`
    - cleanup 時に未発火の idle 予約も解除する（`cancelIdleCallback`）
    - _Requirements: 6.5, 6.6_
  - [ ]\* 7.4 `realtimeChannelRegistry.test.ts` を作成する
    - 同一 roomId への複数 subscribe で `supabase.channel` が 1 回のみ呼ばれる
    - 全 unsubscribe で `removeChannel` が呼ばれる
    - INSERT イベントが全 listener に dispatch される
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 8. useChatHandlers の参照安定化（Requirement 7）
  - [ ] 8.1 `useChatHandlers.ts` のシグネチャを変更する
    - `name` / `color` / `email` / `setName` / `setMessage` を引数から削除
    - 代わりに `identityRef: React.MutableRefObject<{ name; color; email; avatar }>` を受け取る
    - `useCallback` の依存配列から `name` / `color` / `email` を除去し、`identityRef` のみ追加
    - 関数内では `identityRef.current.name` を読む
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ] 8.2 退室時の入力クリアロジックを `handleExit` から削除する
    - 入力 state は子コンポーネントに移譲するため、ハンドラからは触らない
    - 代わりに `routes/ChatRoute.tsx` 側で `chatRoomKey` 更新により `ChatRoomContainer` を再 mount する設計を Task 9 で導入
    - _Requirements: 7.4_
  - [ ] 8.3 `routes/ChatRoute.tsx` 内の `onSend={(msg, metadata) => handleSend(msg, metadata)}` を `onSend={handleSend}` に変更する
    - 同様のインラインラムダがあれば全て除去
    - _Requirements: 7.5_
  - [ ] 8.4 `routes/ChatRoute.tsx` に `identityRef = useRef<Identity>(...)` を追加し、`useChatHandlers` に渡す
    - この時点では Container 化はまだなので、shell 内の `name/color/email/avatar` state を `identityRef.current` に手動で同期する繋ぎ実装を入れてよい（Task 9 で Container 化と同時に整理）
    - _Requirements: 7.2_
  - [ ]\* 8.5 `useChatHandlers.test.ts` を作成する
    - `identityRef.current` を書き換えてもハンドラ参照が変わらないこと
    - `roomId` 変化時のみ参照が更新されること
    - _Requirements: 7.1, 7.3_

- [ ] 9. 入力 state の Container 化（Requirement 2）
  - [ ] 9.1 `src/features/chat/components/EntryForm/Container.tsx` を新規作成する
    - `name` / `color` / `email` を内部 state として保持
    - `useSettings` の初期値を反映
    - `identityRef.current` を `useEffect` で同期更新
    - submit 時に `onEnter({ name, color, email, silent, avatar })` を呼び `identityRef.current` を最新化
    - presentational な `EntryForm` 本体は変更しない（props 互換）
    - _Requirements: 2.1, 2.3, 2.6, 2.8_
  - [ ] 9.2 `src/features/chat/components/ChatRoom/Container.tsx` を新規作成する
    - `message` を内部 state として保持
    - フォントスタイル（`fontSize` / `fontColor` / `bold`）も `ChatRoom` 内部 state に閉じたまま維持
    - `windowRows` / `setWindowRows` は親（ChatPageShell）から prop で受け取り、`ChatRoom` に流す
    - `onSend(msg, metadata)` を呼ぶ
    - 退室時の入力クリアは親の `chatRoomKey` 更新で実現するため、Container 内には書かない
    - _Requirements: 2.2, 2.4, 2.5, 2.7, 2.9_
  - [ ] 9.3 `ChatRoom/index.tsx` から `chatLog: Chat[]` プロップを**完全削除**する
    - フォーカス制御 `useEffect(..., [chatLog, isPending])` を `[isPending]` のみに変更
    - `ChatRoomProps` 型から `chatLog` を削除
    - 送信完了時のフォーカス復帰の挙動は維持される（isPending が false に戻る瞬間）
    - _Requirements: 2.5_
  - [ ] 9.4 `routes/ChatRoute.tsx` を `ChatPageShell` 構造に再構成する
    - 残す state: `entered` / `showRanking` / `chatRoomKey` / `windowRows` / `identityRef`
    - 削除する state: `name` / `color` / `email` / `message` / `avatar`（Container に移譲）
    - Task 8.4 で導入した繋ぎ実装（shell 側の name/color/email/avatar を identityRef に同期）を削除
    - `EntryFormContainer` と `ChatRoomContainer` を使う
    - `ChatRoomContainer` の `key={chatRoomKey}` で退室時の再 mount を実現
    - `useChatHandlers` 呼び出しから shell の state 引数を削除し、`identityRef` のみを渡す
    - _Requirements: 2.1, 2.2, 2.6, 2.7, 2.9_
  - [ ]\* 9.5 統合テストを追加する
    - React.Profiler で発言入力中に `ChatLogList` の commit が発生しないことを確認
    - 退室後の再入室で `ChatRoomContainer` の入力 state が初期化されている
    - _Requirements: 2.1, 2.2_

- [ ] 10. RetroSplitter のメモ化と top/bottom 安定参照化（Requirement 9）
  - [ ] 10.1 `RetroSplitter/index.tsx` のデフォルト export を `React.memo` でラップする
    - 既存実装は変更しない
    - _Requirements: 9.1, 9.6_
  - [ ] 10.2 `routes/ChatRoute.tsx`（ChatPageShell）で `top` / `bottom` を `useMemo` で安定化する
    - `top` の依存: `[entered, chatRoomKey, room.title, windowRows, handleSend, onExit, handleReload, onShowRanking, handleEnter]`
    - `bottom` の依存: `[showRanking, chatLog, isLoading, windowRows, onHideRanking]`
    - `onShowRanking` / `onHideRanking` は `useCallback` で安定化
    - _Requirements: 9.2, 9.3, 9.4, 9.5_
  - [ ]\* 10.3 RetroSplitter のメモ化が機能していることを統合テストで確認する
    - message / フォントスタイル / 名前・色入力では RetroSplitter が再レンダしない（Profiler で確認）
    - windowRows 変更時のみ top + bottom が更新される
    - _Requirements: 9.1, 9.2, 9.5_

- [ ] 11. TopPage の段階描画と Room_Prefetcher（Requirement 8）
  - [ ] 11.1 `src/shared/utils/networkHeuristics.ts` を新規作成する
    - `shouldSkipPrefetch()` を export
    - `navigator.connection.saveData` / `effectiveType` を読み取り、`'slow-2g'` / `'2g'` でスキップ
    - `navigator.connection` が未定義のブラウザでは false（プリフェッチ実施）を返す
    - _Requirements: 8.9_
  - [ ] 11.2 `src/features/top/utils/roomPrefetcher.ts` を新規作成する
    - **runtime 依存はすべて動的 import**: `@features/chat/api/chatLogResource` と `@features/chat/rooms` を static import しない（TopPage 初期バンドルに chat 専用コードを混入させない、R1.4 / Success Metrics 準拠）
    - `RoomId` は `import type` で型のみ取得（erased）
    - `prefetchedKeys: Set<string>` でリンク単位 + idle トリガーを共通 dedupe
    - `chatRouteImport: Promise<unknown> | null` / `chatLogResourceImport` / `roomsImport` を内部キャッシュし、それぞれ 1 回だけ動的 import 発火
    - `prefetchRoom(roomId: RoomId | null, key: string)` を export: `roomId === null` のとき何もしない（外部リンクや roomId 未解決の内部リンクも一律に無視）
    - `schedulePrefetchOnIdle(getLastRoomId)` を export: dynamic `loadChatLogResource()` と `loadRooms()` を `Promise.all` で待ってから `isRoomId` 判定と `prefetchChatLogs` を発火
    - `requestIdleCallback` がなければ `setTimeout(fn, 1500)` フォールバック、`timeout: 2000` を渡す
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 8.8, 8.10, 8.11, 8.12, 1.4_
  - [ ] 11.3 `settingsStore.ts` に `readLastRoomId()` を追加する
    - `UserSettings` に `lastRoomId?: string` を追加（`mergeWithDefaults` も対応）
    - `readLastRoomId()` は `cachedSettings.lastRoomId ?? null` を返す
    - 書き込みは既存 `updateSettings({ lastRoomId })` で可能
    - _Requirements: 8.10_
  - [ ] 11.4 入室成功時に `lastRoomId` を保存する
    - `useChatHandlers.handleEnter` の成功フローで `updateSettings({ lastRoomId: roomId })` を呼ぶ
    - もしくは `EntryFormContainer` の `onEnter` 完了後に呼ぶ
    - _Requirements: 8.10_
  - [ ] 11.5 `TopPage.tsx` の `RoomAnchor` に `onMouseEnter` / `onFocus` / `onTouchStart` を追加する
    - 外部リンクではプリフェッチしない
    - `roomId` が存在しない内部リンク（例: `/chanari/:roomId` の roomId 未解決ケース）でもプリフェッチを一切発火しない（R8.7 に統一）。`prefetchRoom(item.roomId ?? null, item.href)` を呼ぶだけで `roomId === null` の場合は `roomPrefetcher` 内部で no-op
    - _Requirements: 8.4, 8.5, 8.7_
  - [ ] 11.6 `TopPage.tsx` の `useEffect` で `schedulePrefetchOnIdle(() => readLastRoomId())` を呼ぶ
    - 初回マウントの 1 回のみ実行
    - _Requirements: 8.8, 8.10_
  - [ ] 11.7 `TopPage` の `useRoomCounts` 利用形態を確認し、`counts === {}` の初期状態で静的部分が即時描画されることを保証する
    - 現実装でも `resolveCount` が 0 を返すフォールバックがあるが、`isLoading` で skeleton を出している箇所があれば削除
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ]\* 11.8 `roomPrefetcher.test.ts` / `networkHeuristics.test.ts` / `TopPage.test.tsx` にプリフェッチテストを追加する
    - ルームリンクの `mouseenter` で `chatLogResource.prefetchChatLogs` が呼ばれる
    - 同じリンクの 2 回目の `mouseenter` ではプリフェッチが発火しない
    - 外部リンクではプリフェッチが発火しない
    - `roomId === null` の内部リンクでもプリフェッチが発火しない（チャンクも先読みされない）
    - `saveData=true` で idle prefetch がスキップされる
    - first paint 後 idle で `prefetchChatRoute` が発火する（タイマーモック）
    - dynamic import が一度だけ走り、`chatLogResourceImport` / `roomsImport` が以後共有される
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.11, 8.12_

  - [ ] 11.9 ChatPage の初回表示を 30 件取得 + 背景 100 件補完に段階化する
    - `chatLogResource` の canonical snapshot（100 件）は維持し、`loadChatLogs(roomId)` の意味は変更しない
    - 初回表示専用 API（例: `loadVisibleChatLogs(roomId, limit = 30)`）を追加し、Supabase へ `limit=30` で問い合わせる
    - `ChatRoute` / `useChatLog` は初回 30 件を先に描画し、`requestIdleCallback`（fallback: `setTimeout`）で canonical snapshot 100 件を補完する
    - 補完結果は既存の `mergeChat` / uuid dedupe と整合するように反映し、30 件表示済みのメッセージを重複表示しない
    - `windowRows` が 30 を超える設定の場合は、補完完了まで追加行が遅延表示されることを許容する
    - 参加者抽出・ランキングは補完前は 30 件ベース、補完後は 100 件ベースに更新されることを明示する
    - `ip` / `ua` は初回表示用 SELECT から除外し、表示に必要な列だけを取得する
    - _Requirements: 5.1, 5.2, 5.8, 8.1, 8.8_
  - [ ]\* 11.10 初回 30 件 + 背景補完のテストを追加する
    - 初回 mount では `limit=30` の Supabase mock が呼ばれ、30 件が先に描画される
    - idle 発火後に canonical snapshot 100 件取得が走り、重複なしで 100 件へ補完される
    - 同一 roomId の hover / idle prefetch 済み canonical snapshot がある場合は、初回 30 件 API を追加発火せず cache から 30 件を切り出す
    - `ip` / `ua` が初回表示用 SELECT に含まれないことを検証する
    - _Requirements: 5.1, 5.2, 5.8, 8.8_

- [ ] 12. パフォーマンス計測と検証
  - [ ] 12.1 `pnpm analyze:bundle` で TopPage 初期 JS 転送量を計測し、現状比 30% 削減を確認する
    - Network タブで `index.html` 訪問時に取得されるファイルサイズの総和を比較
    - chat 専用コード（EntryForm / ChatRoom / RetroSplitter / ChatLogList / useChatLog / useChatHandlers / useParticipants）が initial bundle から外れていることを `grep` で確認
    - `vendor-supabase` は `useRoomCounts` 依存として残ってよい（Non-Goals）
    - _Success Metrics_
  - [ ] 12.2 ChatPage で React DevTools Profiler を起動し、発言入力中に `ChatLogList` の commit が発生しないことを確認する
    - _Success Metrics_
  - [ ] 12.3 ChatPage 初回マウント時の Supabase リクエストが 1 件であることを Chrome DevTools Network で確認する
    - _Success Metrics_
  - [ ] 12.4 `pnpm lighthouse:mobile` と `pnpm lighthouse:desktop` を実行し、Performance スコアの劣化がないことを確認する
    - _Success Metrics_
  - [ ] 12.5 Network throttling で lazy チャンクのロード失敗を再現し、`RouteErrorBoundary` のフォールバック UI が表示されること、再試行ボタンで `import()` が再発火することを確認する
    - DevTools の Network タブで `ChatRoute-*.js` の 2 回目のリクエストが発生することを目視
    - _Success Metrics_
  - [ ] 12.6 TopPage 表示後の Network タブで `assets/ChatRoute-*.js` が first paint 後 5 秒以内にロードされることを確認する（高速回線時）
    - _Success Metrics_
