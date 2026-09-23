# 実装計画: react-2026-refactoring

## 概要

[requirements.md](./requirements.md) の 18 要件を、単独で revert できる PR に分けて進める。
**振る舞いを変える PR と、構造だけを変える PR を混ぜない。** 構造だけの PR は、既存のテストを書き換えずに
通ることを完了の条件にする。

## 推奨実装順序（PR 単位）

優先度の高い順に並べた。**PR1 を必ず最初に出す**（コンパイラが効いていない状態では、ほかの PR の性能を
正しく評価できないため）。

| PR   | Task                  | 要件              | 種別            | 規模   | 備考                                                        |
| ---- | --------------------- | ----------------- | --------------- | ------ | ----------------------------------------------------------- |
| PR1  | Task 1                | R1                | ビルド          | 小     | **最優先。** `@babel/core` の固定と Compiler_Check          |
| PR2  | Task 2 + Task 3       | R2 / R3           | 振る舞い        | 小     | 楽観的更新と参加者リストの不具合                            |
| PR3  | Task 4                | R4（R8.4 の一部） | 振る舞い        | 小〜中 | エラー表示                                                  |
| PR4  | Task 14.1 + Task 13.1 | R14.1 / R13.2     | 性能            | 極小   | 先に出せる小さな変更（`message` 列、不要なヘッダ）          |
| PR5  | Task 5                | R5                | 構造            | 中     | デッドコードの削除（Q1 / Q2 回答済み）                      |
| PR6  | Task 6                | R11               | 静的解析        | 小     | PR2〜PR5 で違反の大半が消えてから                           |
| PR7  | Task 7                | R6（段階 1）      | 構造            | 中     | store を入れ、`useChatLog` の返り値の形は保つ               |
| PR8  | Task 8                | R6（段階 2）+ R7  | 構造            | 大     | `useRoomLog` / Chat_Session へ移し、古いフックと API を消す |
| PR9  | Task 9                | R8                | 構造 + 性能     | 中     | ChatRoom を form action に                                  |
| PR10 | Task 10               | R9                | 構造            | 小     | Persistent_Store                                            |
| PR11 | Task 11               | R10               | 振る舞い        | 小     | Pointer Events                                              |
| PR12 | Task 12               | R12               | 依存 + 振る舞い | 中     | React 19.3、Activity、ViewTransition                        |
| PR13 | Task 13               | R13               | 性能            | 中     | スパイクで 15 kB gz 以上減るときだけ                        |
| PR14 | Task 14               | R14               | 性能 + DB       | 中     | RPC のマイグレーションを含む                                |
| PR15 | Task 15               | R15               | ビルド          | 中     | 他 spec の `vite.config.ts` の変更と衝突しない時期に        |
| PR16 | Task 16               | R16               | スパイク        | 小〜中 | 決定を design.md に書いてから実装                           |
| PR17 | Task 17               | R17               | 性能（任意）    | 小     |                                                             |

Task 18（R18: ドキュメントと検収）は、各 PR の最後に共通して行う。

## Tasks

- [x] 1. React Compiler の適用範囲を回復し、回帰を検知する（Requirement 1、PR1）
  - [x] 1.1 `package.json` の `@babel/core` を `~7.29.7` に固定し、`pnpm install` でロックファイルを更新する
    - `@rolldown/plugin-babel` の peerDependencies（`^7.29.0 || ^8.0.0-rc.1`）を満たすことを確かめる
    - _Requirements: 1.1_
  - [x] 1.2 `useRoomCounts` の既定引数を `DEFAULT_WINDOW_MS` 定数にする
    - _Requirements: 1.5_
  - [x] 1.3 `src/test/reactCompiler.test.ts`（Compiler_Check）を追加する
    - 対象: `src/**/*.{ts,tsx}` から `*.test.*` / `*.stories.*` / `src/test/` / `src/storybook/` / `*.d.ts` を除く
    - 意図した opt-out は `'use no memo'` + 直前の理由コメントで表し、ソースから検査する（ChatLogPage は Task 5 で削除するまで opt-out にする）
    - _Requirements: 1.2, 1.3, 1.4_
  - [x] 1.4 `pnpm build` の出力で、ChatRoom / EntryForm / ChatLogList / RetroSplitter / Button / Input がコンパイル
        されている（`react.memo_cache_sentinel` を参照する）ことを確かめ、PR 本文に記録する
    - _Requirements: 1.1_
  - [ ] 1.5 発言の入力 1 文字あたりの再レンダーの範囲を記録する（Task 9 の比較基準。Task 9.5 の再レンダー計測テストで前後を記録するまで未完了）
    - _Requirements: 1.1_
  - [x] 1.6 CLAUDE.md の「React Compiler」節に、`@babel/core` を固定している理由と、固定を外す条件を書く
    - _Requirements: 1.6, 18.1_

- [ ] 2. 楽観的更新を送信側で完結させる（Requirement 2、PR2）
  - [ ]\* 2.1 失敗するテストを先に書く: 実際の `useOptimistic` と `useChatSender` を組み合わせ、Action の外 /
    `useActionState` 経由 / async Action の中の 3 通りで、保存が解決する前に楽観的なチャットが表示されることを
    確かめる（今は「Action の外」だけ失敗する）
    - _Requirements: 2.4_
  - [ ] 2.2 `useChatSender` に `sendWithOptimistic` を作り、楽観的な表示 → 保存 → `startTransition(applySaved)` を
        1 つの `startTransition(async …)` の中で行う。Action の中の例外は捕まえて Promise の reject で返す
    - _Requirements: 2.1, 2.3_
  - [ ] 2.3 `showOptimistic` + `saveAndMerge` を別々に呼んでいる箇所（入室、退室、発言、おみくじ）を
        `sendWithOptimistic` に置き換える。退室の「表示を先に戻す」処理は、呼ぶ前に同期で行う
    - _Requirements: 2.2_
  - [ ]\* 2.4 保存が失敗したときに楽観的なチャットが消え、呼び出し元にエラーが届くテストを追加する
    - _Requirements: 2.3_

- [ ] 3. 参加者リストに時間の経過を反映する（Requirement 3、PR2）
  - [ ]\* 3.1 失敗するテストを先に書く: 4 分前の発言 → 偽のタイマーで 3 分進める → 「参加者(0)」
    - _Requirements: 3.4_
  - [ ] 3.2 `getRecentParticipants(chatLog, now)` にし、関数の中の `Date.now()` を消す
    - _Requirements: 3.1_
  - [ ] 3.3 参加者の計算を ChatLogList から ParticipantsList に移し、`useNowMinute()` の `now` を渡す。
        ParticipantsList の props を `participants` から `chatLog` に変える
    - _Requirements: 3.2, 3.3_
  - [ ] 3.4 `useParticipants.test.ts` と ParticipantsList / ChatLogList のテスト・stories を新しい引数に合わせる
    - _Requirements: 3.1_

- [ ] 4. 非同期エラーを画面に出す（Requirement 4、PR3）
  - [ ] 4.1 `useChatLog` の取得に `.catch` を付けて `loadError` を返す。ChatLogList（または呼び出し元）が
        `loadError` のとき、失敗の表示と「再読み込み」ボタン（`reload`）を出す
    - _Requirements: 4.1_
  - [ ] 4.2 EntryForm を `useActionState` にする。失敗をフォームの下に出し、pending の間は送信ボタンを無効にする。
        `updateSettings` は成功したときだけ呼ぶ
    - _Requirements: 4.2, 4.3, 8.4_
  - [ ] 4.3 ChanariEntryForm と ChanariChatRoom の送信を `useActionState` にし、失敗を表示する
    - _Requirements: 4.4, 8.4_
  - [ ]\* 4.4 取得の失敗、入室の失敗、ちゃなりの送信の失敗のテストを追加する。未処理の rejection がないことを
    vitest の `unhandledRejection` の検知で確かめる
    - _Requirements: 4.1, 4.2, 4.4_

- [ ] 5. デッドコードと重複ユーティリティを削除する（Requirement 5、PR5）
  - [x] 5.1 Q1（利用規約モーダル）と Q2（架空の発言のフォールバック）の回答をもらい、requirements.md に記録する
    - _Requirements: 5.5, 5.6_
  - [ ] 5.2 本番から到達しないモジュールと、そのテスト・stories を削除する: ChatLogPage、usePreloadChatLogs、
        useChatRanking、Loader、barrel の `index.ts` 群（Q1 の回答により TermsModal / Modal / `content/terms.mdx` /
        `@mdx-js/*` / vite.config の `mdx()` も）
    - _Requirements: 5.1, 5.5_
  - [ ] 5.3 chatApi の未使用の関数（design.md §5 の表）と、`chatAllSend.buildAllRoomsSendPayload`、
        `fallback.monitorNetworkStatus` を削除する
    - _Requirements: 5.2_
  - [ ] 5.4 `retry.ts` を作り、chatApi と chatLogResource の `retryApiCall` / `measureApiCall` / 遅延計測を
        1 つにする。`perfStartTime` のようなモジュールの可変状態をなくす
    - _Requirements: 5.3_
  - [ ] 5.5 `generateOperationId` を `crypto.randomUUID()` にし、`uuid.ts` の未使用の関数と、依存の `uuid` /
        `@types/uuid` を削除する。`isUUIDv7` と `sortChatsByTime` は残す
    - _Requirements: 5.4_
  - [x] 5.6 Q2 の回答により `mockChatData` の経路は残す（変更なし）
    - _Requirements: 5.6_
  - [ ] 5.7 Compiler_Check の opt-out が残っていないことを確かめる（ChatLogPage の削除で消える）
    - _Requirements: 1.2_
  - [ ] 5.8 到達しないモジュールを CI で検出する仕組み（knip など）の導入を検討し、
        到達しないモジュールが 0 であることを確かめる
    - _Requirements: 5.1_

- [ ] 6. 型情報を使う lint を入れる（Requirement 11、PR6）
  - [ ] 6.1 `eslint.config.js` に typescript-eslint の `no-floating-promises` / `no-misused-promises` /
        `no-explicit-any` を、型情報つき（`projectService`）で `src/` の本番コードに error として追加する
    - _Requirements: 11.1, 11.3_
  - [ ] 6.2 残っている違反を直すか、理由のコメント付きで抑制する
    - _Requirements: 11.2, 4.5_
  - [ ] 6.3 CI の lint の所要時間を PR 本文に記録する
    - _Requirements: 11.3_

- [ ] 7. Room_Log_Store を入れる（段階 1: 内部の置き換え）（Requirement 6、PR7）
  - [ ] 7.1 `features/chat/api/roomLogStore.ts` を作る（design.md §6 のインターフェースと状態遷移表）
    - target ごとのアダプタ（部屋 / 全部屋まとめ）で、取得・Realtime・列の違いを吸収する
    - 最後の購読解除では 1 タスク遅らせて channel を外す
    - _Requirements: 6.1, 6.3, 6.4, 6.7_
  - [ ]\* 7.2 状態遷移表の各行をテストする（偽のアダプタを使う）。特に「取得中に届いた発言が残る」「SUBSCRIBED で
    取り直す」「拡張で既存を残す」「取り直しで論理削除が消える」「StrictMode の購読 → 解除 → 再購読で channel を
    張り直さない」「全部屋まとめも接続時に取り直す」
    - _Requirements: 6.3, 6.4, 6.5_
  - [ ] 7.3 `useChatLog` と `useAllRoomsChatLog` の中身を store + `useSyncExternalStore` + `useOptimistic` に
        置き換える。返り値の形は変えない（ルートは触らない）
    - _Requirements: 6.2, 6.6_
  - [ ] 7.4 既存の `useChatLog.test.ts` / `useAllRoomsChatLog` 関連のテストが、書き換えずに通ることを確かめる
    - _Requirements: 6.5_

- [ ] 8. `useRoomLog`、Chat_Identity、Chat_Session に移す（段階 2）（Requirement 6 / 7、PR8）
  - [ ] 8.1 `useRoomLog(target)` を作る。計測のコールバックは `useEffectEvent` で `store.onInsert` に登録する
    - _Requirements: 6.2_
  - [ ] 8.2 `useChatIdentity` を作り、ChatRoute / AllRoomsRoute / ChanariChatPage の名前・色・メール・アバター・
        入室状態をそこに移す
    - _Requirements: 7.2_
  - [ ] 8.3 `useChatSession(target)` を作り、`useChatHandlers` と `useAllRoomsChatHandlers` を統合する。
        design.md §7 の「部屋と全部屋まとめで違う点」の表を、そのままテストケースにする
    - _Requirements: 7.1, 7.3_
  - [ ] 8.4 clear コマンドの表示への反映を `store.removeOwn` にし、`setChatLog` の公開をやめる
    - _Requirements: 7.5_
  - [ ]\* 8.5 3 つのルートで、入室 → 発言 → コマンド → 退室の analytics と計測のイベント列を、移行前の記録と比べる
    - _Requirements: 7.4_
  - [ ] 8.6 `useChatLog` / `useAllRoomsChatLog` / `useChatHandlers` / `useAllRoomsChatHandlers` / `chatLogResource` /
        `chatApi.ts` を削除し、design.md §5 の構成（`saveChat` / `chatQueries` / `realtime` / `roomLogStore`）に分ける
    - _Requirements: 6.8, 7.1_

- [ ] 9. フォームを React 19 の Actions に揃える（Requirement 8、PR9）
  - [ ] 9.1 ChatRoom の発言の値を ChatRoom の中の state にし、ChatRoute / AllRoomsRoute から `message` /
        `setMessage` を外す
    - _Requirements: 8.2_
  - [ ] 9.2 ChatRoom を `<form action={formAction}>` にし、`onSubmit` ではランキングを閉じることと入力欄を空にする
        ことだけを行う
    - _Requirements: 8.1, 8.3_
  - [ ]\* 9.3 `onSubmit` で入力欄を空にしても、送信した値が action に届くことをテストする
    - _Requirements: 8.3_
  - [ ] 9.4 ちゃなりの下書きの復元と、最後の発言の保存が今と同じに動くことを確かめる
    - _Requirements: 8.5_
  - [ ] 9.5 Task 1.5 と同じ手順で再レンダーの範囲を記録し、ChatRoom の中だけになったことを確かめる
    - _Requirements: 8.2_

- [ ] 10. 永続化ストアの書き方を揃える（Requirement 9、PR10）
  - [ ] 10.1 `shared/utils/persistentStore.ts` を作る（生の文字列が同じなら同じ参照を返す）
    - _Requirements: 9.1_
  - [ ] 10.2 settingsStore をその上に作り直す（公開している関数の形は変えない）
    - _Requirements: 9.1, 9.4_
  - [ ] 10.3 ちゃなりの draftStore をその上に作り直し、`useChanariSettings` を `useSyncExternalStore` で読む形にする。
        roomId で読み直す Effect と ref を同期する Effect を消す
    - _Requirements: 9.2, 9.3, 9.4_
  - [ ]\* 10.4 参照の安定、別タブの追随、壊れた JSON のテストを書く。下書きを保存した状態で SSG 済み HTML を
    hydrate しても不一致が出ないテストを残す
    - _Requirements: 9.2, 9.4_

- [ ] 11. RetroSplitter を Pointer Events にする（Requirement 10、PR11）
  - [ ] 11.1 分割バーを `pointerdown` + `setPointerCapture` / `pointermove` / `pointerup` / `lostpointercapture` に
        し、`touch-action: none` を付ける
    - _Requirements: 10.1, 10.3_
  - [ ] 11.2 window への `mousemove` / `mouseup` の登録、`onMouseMove` / `onMouseUp` / `calcPercent` の
        `useCallback`、`topHeightRef` の同期 Effect を消す。CLAUDE.md の「残す useCallback」の一覧から外す
    - _Requirements: 10.2, 18.1_
  - [ ]\* 11.3 ポインタ操作とキーボード操作のテストを書く（jsdom 用に `setPointerCapture` のスタブを用意する）
    - _Requirements: 10.1, 10.4_
  - [ ] 11.4 タッチ端末（または DevTools のエミュレーション）でドラッグできることを確かめる
    - _Requirements: 10.1, 10.3_

- [ ] 12. React 19.3 に上げて Activity と ViewTransition を使う（Requirement 12、PR12）
  - [ ] 12.1 `react` / `react-dom` / `@types/react` / `@types/react-dom` を 19.3 系に上げる。開発環境の SSG ページの
        hydration で Effect が二重に呼ばれても、Realtime の channel が重複しないことを確かめる
    - _Requirements: 12.1_
  - [ ] 12.2 ChatLogList と ChatRanking にそれぞれのスクロール枠を持たせ、RetroSplitter の下段の枠は
        `overflow: hidden` にする
    - _Requirements: 12.2a_
  - [ ] 12.3 ランキングを表示している間、ChatLogList を `<Activity mode="hidden">` で残す。開閉は `startTransition`
        で行う
    - _Requirements: 12.2, 12.2a_
  - [ ] 12.4 ランキングとログの切り替え、入室フォームとチャット入力の切り替えを `<ViewTransition>` で包み、
        `prefers-reduced-motion: reduce` でアニメーションを止める CSS を入れる
    - _Requirements: 12.3, 12.4, 12.5_
  - [ ]\* 12.5 ランキングから戻ったときに ChatLogList が再マウントされない（マウントの回数を数える）テストを書く
    - _Requirements: 12.2_
  - [ ] 12.6 Chrome と Safari で、アニメーションと reduced-motion を確かめる
    - _Requirements: 12.3, 12.4_

- [ ] 13. チャット系ルートの初期 JS を減らす（Requirement 13、PR4 / PR13）
  - [ ] 13.1 `supabaseClient.ts` のグローバルヘッダから `Accept-Encoding` / `X-My-Custom-Header` /
        `Content-Type` を外す（PR4 で先に出す）
    - _Requirements: 13.2_
  - [ ] 13.2 スパイク: `@supabase/postgrest-js` / `@supabase/realtime-js` / `@supabase/functions-js` だけで最小の
        クライアントを作り、チャット系ルートの modulePreload の合計（gzip）を比べる。結果を design.md §13 に書く
    - _Requirements: 13.1_
  - [ ] 13.3 15 kB gz 以上減るときだけ、`shared/supabase/{rest,realtime,functions}.ts` に置き換える
    - _Requirements: 13.1, 13.3_
  - [ ]\* 13.4 Realtime の再接続、`save-chat` のヘッダ（`x-chat-operation-id` / `x-chat-attempt`）、New Relic の
    `traceparent` を確かめる（`scripts/verify-trace.ts` を使う）
    - _Requirements: 13.3_

- [ ] 14. トップの参加人数の集計をサーバーに移す（Requirement 14、PR4 / PR14）
  - [ ] 14.1 `buildRoomCountsUrl` の `select` から `message` を外す（PR4 で先に出す）
    - _Requirements: 14.1_
  - [ ] 14.2 `room_participant_counts(since_ms)` の RPC を作るマイグレーションを追加する（`security invoker`）。
        必要なら `time` の部分インデックスを足す
    - _Requirements: 14.2, 14.4_
  - [ ] 14.3 `fetchRoomParticipantCounts` を RPC の呼び出しにする（supabase-js は使わず `fetch` のまま）
    - _Requirements: 14.2_
  - [ ]\* 14.4 同じ入力データで、RPC の結果と `aggregateCountsFromRows` の結果が一致することを確かめる
    - _Requirements: 14.3_

- [ ] 15. ビルド設定を Vite 8 に合わせ、SSG の API を更新する（Requirement 15、PR15）
  - [ ] 15.1 `build.rollupOptions` を `build.rolldownOptions` に改名する
    - _Requirements: 15.1_
  - [ ] 15.2 関数形式の `manualChunks` を `codeSplitting` の groups に書き換え、`dist/assets` のチャンクの一覧と
        サイズを前後で比べる
    - _Requirements: 15.2_
  - [ ] 15.3 `entry-server.tsx` を `prerenderToNodeStream` + `node:stream/consumers` の `text()` にする
    - _Requirements: 15.3_
  - [ ] 15.4 `pnpm build:prod` の前後で、`dist/**/index.html` の `#root` の中身と modulePreload を比べる
    - _Requirements: 15.4_
  - [ ] 15.5 Oxc の minify で console の削除ができることを確かめ、terser と gzip の合計を比べる。差が 1% 以内なら
        Oxc にする
    - _Requirements: 15.5_

- [ ] 16. ページ間の遷移方式を決める（Requirement 16、PR16）
  - [ ] 16.1 スパイク: 方式 A（`@view-transition` + Speculation Rules）を試験的に入れ、トップ → 部屋で入室フォームが
        操作できるまでの時間と、Realtime が `SUBSCRIBED` になるまでの時間を測る
    - _Requirements: 16.1_
  - [ ] 16.2 結果と決定（A / B、top-and-transition-performance の R4 / R5 の扱い）を design.md §16 に書く
    - _Requirements: 16.1, 16.4_
  - [ ] 16.3 A を選んだ場合: トップの部屋リンクに Speculation Rules（`prefetch`、`eagerness: moderate`）を付け、
        CSS に `@view-transition { navigation: auto; }` と reduced-motion の無効化を入れる
    - _Requirements: 16.2, 16.3_

- [ ] 17. 長いログの描画コストを下げる（Requirement 17、PR17、任意）
  - [ ] 17.1 1 件の合流を二分探索での挿入にし、UUID の比較を `<` にする
    - _Requirements: 17.1, 17.2_
  - [ ] 17.2 ChatLogList のソートを外す（入力がソート済みであることを前提にする）
    - _Requirements: 17.1_
  - [ ] 17.3 行数が 200 を超えるとき、各行に `content-visibility: auto` を当てる
    - _Requirements: 17.3_
  - [ ]\* 17.4 合流の結果が今の `mergeChatLogByUuid` と一致することを、fast-check のプロパティテストで確かめる
    - _Requirements: 17.1_

- [ ] 18. ドキュメントの整合と検収（Requirement 18、各 PR 共通）
  - [ ] 18.1 CLAUDE.md と `docs/ARCHITECTURE.md` を、その PR の変更に合わせる（コンパイラの適用範囲、手動メモ化の
        例外、ログ取得の流れ、削除したモジュール）
    - _Requirements: 18.1_
  - [ ] 18.2 `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build:prod` を通す
    - _Requirements: 18.2_
  - [ ] 18.3 性能に関わる PR では、変更前後のチャンクサイズ（gzip）を PR 本文に書く
    - _Requirements: 18.3_
