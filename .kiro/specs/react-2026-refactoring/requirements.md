# Requirements Document: react-2026-refactoring

## Introduction

2026 年時点の React の設計思想（[research.md](./research.md)）と照らし合わせて、パフォーマンスと保守性の
観点で現行コードをリファクタリングする。前提は React 19.2.6、React Compiler 1.0、Vite 8.0、Supabase JS 2.105。

既存 spec との関係:

- [`top-and-transition-performance`](../top-and-transition-performance/requirements.md) が扱うフォント、SSG、
  サードパーティの遅延化、Room_Prefetcher は**本 spec では扱わない**。同 spec の Requirement 4
  （クライアントサイド遷移）は、本 spec の Requirement 16 で方式を決め直す
- [`post-deps-modernization-followup`](../post-deps-modernization-followup/requirements.md) の Vitest 更新（R3）は
  同 spec に任せる。ただし Vitest はすでに 5.0.1 が出ているので、目標バージョンの見直しを勧める
- [`spa-performance-optimization`](../spa-performance-optimization/requirements.md) の未完タスク（Task 6〜8）は、
  本 spec の Requirement 6 / 7 が引き継ぐ

### コード調査で確認した事実

調査日は 2026-09-23、対象は `main`（6b168aa）。「確認方法」の列に書いたとおり、推測ではなく実行して確かめた
ものを載せる。

| #   | 事実                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 確認方法                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **React Compiler が 73 関数中 18 をコンパイルしていない（CompileError 21 件。同じ関数で複数回出るものを含む）。** ChatRoom / EntryForm / ChatLogList / RetroSplitter / Button / Input / useChatHandlers / useAllRoomsChatHandlers など。原因は `@babel/core` 8.0.1 との非互換で、分割代入のデフォルト値があるだけで失敗する。導入時（894c5e9）から一度もコンパイルされていない                                                                                                                                                                                                                                  | 本番と同じ `@babel/core` 8.0.1 + `babel-plugin-react-compiler` 1.0.0 で `src/` を変換し、logger で集計した。Babel 7.29 で変換すると、失敗は 2 関数（useRoomCounts の既定引数、ChatLogPage の try/finally）だけになる |
| F2  | **楽観的更新が効くかどうかが呼び出し元で決まる。** `useChatSender.showOptimistic` は同期の `startTransition(() => addOptimistic(chat))`（`useChatSender.ts:66`）なので、Action の外から呼ぶと、楽観的なチャットが保存完了前に消える。ChatRoom の発言は `useActionState` の中で呼ばれるので表示されるが、**入室の Welcome、退室、ちゃなりの発言**は保存が終わるまで表示されない                                                                                                                                                                                                                                  | 一時テストで 3 通り再現した。Action の外: 保存が解決する前の表示は `[]`。`useActionState` 経由: `["temp-1:hello"]`。async Action の中で呼んだ場合: `["temp-1:hello"]`                                                |
| F3  | **参加者リストが時間の経過で更新されない。** `getRecentParticipants` がレンダー中に `Date.now()` を呼び（`useParticipants.ts:13`）、結果は chatLog が変わるまで固定される。発言がなければ、5 分を過ぎた人が残り続ける                                                                                                                                                                                                                                                                                                                                                                                           | 一時テストで、4 分前に発言した人がいる状態から 3 分進めても「参加者(1)」のままだった（時計の表示だけが進む）                                                                                                         |
| F4  | **非同期エラーが画面に出ない経路がある。** 部屋ログの取得失敗には `.catch` がなく（`useChatLog.ts:188`）、「まだ発言はありません。」と表示される。EntryForm は async の `onSubmit`（`EntryForm/index.tsx:61`）で、入室に失敗すると未処理の rejection になる。ChanariChatRoom は `onSend` の Promise を捨てている（`ChanariChatRoom/index.tsx:58`）                                                                                                                                                                                                                                                              | コードを読んで確認した。型情報を使う lint を試験的に有効化すると、`no-floating-promises` 11 件、`no-misused-promises` 6 件、`no-explicit-any` 2 件                                                                   |
| F5  | **チャットセッションの処理が 3 か所に重複している。** ChatRoute / AllRoomsRoute / ChanariChatPage が、名前・色・メール・アバター・入室状態・入力中のメッセージをそれぞれ持つ。`useChatHandlers`（12 引数）と `useAllRoomsChatHandlers`（14 引数）は入室・退室がほぼ同じコードで、呼び出し元の `setState` を 5〜6 個受け取る。ちゃなりは使わない `setShowRanking: () => {}` を渡している                                                                                                                                                                                                                         | コードを読んで確認した                                                                                                                                                                                               |
| F6  | **本番から到達しないコードが残っている。** ChatLogPage、usePreloadChatLogs、useChatRanking、Loader、Modal、TermsModal（MDX の利用規約を含む）、barrel の index 群（合計約 560 行）。chatApi には未使用の関数がある（`loadChatLogsWithPaging` の offset>0 経路、`loadInitialChatLogs`、`saveChatLog`、`invalidateCacheAsync`、`loadChatLogsByTimeRange`、`clearChatLogs`）。`chatAllSend.ts` の `buildAllRoomsSendPayload` はどこからも呼ばれず、`useAllRoomsChatHandlers` の中に別の実装がある（`kind` を取り除く処理の有無が食い違っている）。`uuid` パッケージは実質 `generateOperationId` にしか使っていない | `main.tsx` と `entry-server.tsx` から import グラフをたどって到達しないファイルを列挙した。`prerenderHtml.ts` は scripts から使うので除外                                                                            |
| F7  | **chatLogResource（454 行）のキャッシュがほとんど効かない。** 5 分の TTL キャッシュ、paging 用の Map、generation 管理を持つが、画面遷移はすべて全ページ読み込み（`pushState` なし）なので、キャッシュが生きるのは 1 ページの表示中だけ。しかも Realtime で届いた発言はキャッシュに入らないため、キャッシュを使うと古くなる（再読み込みではキャッシュを迂回している）                                                                                                                                                                                                                                            | コードを読んで確認した（`chatLogResource.ts:12`、`RoomAnchor` は素の `<a href>`）                                                                                                                                    |
| F8  | **トップの参加人数取得で、発言本文を最大 5000 行転送している。** 部屋ごとのユニーク発言者数を数えるためだけに `message` / `metadata` を含む行を取得し、クライアントで集計する（`roomCountsApi.ts:48-53`）。`message` は集計に使っていない                                                                                                                                                                                                                                                                                                                                                                       | コードを読んで確認した                                                                                                                                                                                               |
| F9  | **RetroSplitter はマウスでしかドラッグできない。** `onMouseDown` と window の `mousemove` を使う（`RetroSplitter/index.tsx:145, 230`）ので、タッチ端末では境界を動かせない                                                                                                                                                                                                                                                                                                                                                                                                                                      | コードを読んで確認した                                                                                                                                                                                               |
| F10 | **チャット系ルートの初期 JS（gzip）** は vendor-react 59.4 kB、vendor-supabase 49.1 kB + iceberg 1.6 kB、entry 22.7 kB、チャット共通 9.1 kB など。Supabase のうち Auth と Storage は使っていない                                                                                                                                                                                                                                                                                                                                                                                                                | `dist/`（Sep 23 のビルド）を `gzip -9` で計測し、プリレンダ HTML の modulePreload と突き合わせた                                                                                                                     |
| F11 | **Vite 8 で非推奨の設定を使っている。** `build.rollupOptions`、関数形式の `manualChunks`。Vitest 3.2.4 は `esbuild` オプションの非推奨警告を出す                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `vite.config.ts:21, 41` とテスト実行時の警告                                                                                                                                                                         |
| F12 | **永続化ストアの書き方がばらばら。** settingsStore は `useSyncExternalStore` と `getServerSnapshot` で書かれているが、ちゃなりの `useChanariSettings` は `useState` の初期化で localStorage を読み、Effect 2 本と ref の同期を持つ。hydration の不一致は一時テストでは再現しなかったので、**不具合ではなく保守性の問題**として扱う                                                                                                                                                                                                                                                                              | コードの確認と一時テスト（下書きを保存したうえで SSG 済み HTML を hydrate した）                                                                                                                                     |
| F13 | ログのマージは 1 件届くたびに全件をソートし、比較に `localeCompare` を使う（`aggregatedLog.ts`、`uuid.ts:68`）。2000 件で 1 回 0.32 ms（`<` 比較なら 0.10 ms、先頭に挿入するだけなら 0.02 ms）。デスクトップでは問題にならない大きさ                                                                                                                                                                                                                                                                                                                                                                            | Node 22 でベンチマークした                                                                                                                                                                                           |

## Glossary

- **Compiler_Check**: `src/` の本番コードを React Compiler に通し、CompileError を数えて CI を失敗させる検査
- **Chat_Sender**: 楽観的な表示、保存、確定値のマージを行う層（現 `useChatSender`）
- **Room_Log_Store**: 部屋（または全部屋まとめ）のログの取得、Realtime 購読、取得中に届いた発言のバッファ、取り直しをまとめて持つ外部ストア。`useSyncExternalStore` で読む
- **Chat_Identity**: 入室者の名前・色・メール・アバターと入室状態。localStorage の設定を既定値にする
- **Chat_Session**: 入室・退室・送信・コマンドを、送信先（単一の部屋 / 全部屋まとめの返信先）を引数にして提供する層
- **Persistent_Store**: localStorage を裏に持ち、`subscribe` / `getSnapshot` / `getServerSnapshot` を公開する共通のストア実装
- **Navigation_Strategy**: ページ間の遷移方式。MPA（全ページ読み込み + ドキュメント間 View Transitions + Speculation Rules）か、クライアントルーティングか

## Requirements

優先度: **P0** = 正しさ・性能の不具合（確認済み）、**P1** = 保守性の構造改善、**P2** = プラットフォーム追従と
性能改善、**P3** = 任意。

### Requirement 1: React Compiler の適用範囲の回復と回帰検知（P0）

**User Story:** 開発者として、手動メモ化を外したコンポーネントが実際にコンパイラでメモ化されていてほしい。
「コンパイラに任せる」という前提（CLAUDE.md）が現実と食い違っていると、性能の判断を誤るため。

#### Acceptance Criteria

1. THE ビルドとテスト SHALL React Compiler を `@babel/core` 7.29 系で実行する。
2. WHEN Compiler_Check が `src/` の本番コード（`*.test.*`、`*.stories.*`、`src/test/`、`src/storybook/` を除く）を
   変換する, THE Compiler_Check SHALL 4 の条件を満たさない CompileError が 1 件でもあれば失敗する。
3. THE Compiler_Check SHALL `pnpm test` の一部として実行される。
4. WHERE 意図してコンパイル対象から外す関数がある, THE 関数 SHALL 本体の先頭に `'use no memo'` を持ち、
   その直前の行に外す理由のコメントを持つ。Compiler_Check はこの 2 つをソースから検査する（位置だけを
   並べた許可リストは使わない。リストに足すだけで CompileError を隠せてしまうため）。
5. THE `useRoomCounts` SHALL 既定引数の式（`6 * 60 * 60 * 1000`）をモジュール定数にし、コンパイルに成功する。
6. THE CLAUDE.md SHALL `@babel/core` を固定している理由と、固定を外す条件（`babel-plugin-react-compiler` が
   Babel 8 に対応し、Compiler_Check が Babel 8 で通ること）を書く。

### Requirement 2: 楽観的更新を送信側で完結させる（P0）

**User Story:** 利用者として、発言・入室・退室した内容がすぐログに出てほしい。保存の往復（リトライ時は数秒）を
待たされるため。

#### Acceptance Criteria

1. WHEN Chat_Sender が楽観的なチャットを表示する, THE Chat_Sender SHALL 表示から保存の完了（成功または失敗）
   までを 1 つの async Transition の中で実行する。
2. WHEN 利用者が発言（通常チャット・ちゃなり）、入室（Welcome）、退室、おみくじのどれかを行う, THE ログ表示 SHALL
   呼び出し元が Action の中にいるかどうかに関係なく、保存が完了するまで楽観的なチャット（「送信中...」）を
   表示する。
3. WHEN 保存が失敗する, THE ログ表示 SHALL 楽観的なチャットを取り除き, THE Chat_Sender SHALL 呼び出し元へ
   エラーを返す。
4. THE テスト SHALL F2 で再現した 3 通り（Action の外 / `useActionState` 経由 / async Action の中）のすべてで、
   保存が解決する前に楽観的なチャットが表示されることを検証する。

### Requirement 3: 参加者リストに時間の経過を反映する（P0）

**User Story:** 利用者として、しばらく発言のない人が参加者一覧から消えてほしい。今いる人を正しく知りたいため。

#### Acceptance Criteria

1. THE `getRecentParticipants` SHALL 基準時刻を引数で受け取る純粋関数で、関数の中で `Date.now()` を呼ばない。
2. WHEN 分の境界が来る, THE 参加者リスト SHALL 新しい発言がなくても再計算され、5 分の窓から外れた発言者を
   除く。
3. THE 参加者リストの再計算 SHALL chatLog が変わったときと、分の境界が来たときに行われる（それ以外の
   親の再レンダーでは再計算しない）。
4. THE テスト SHALL F3 の手順（4 分前の発言 → 3 分進める → 参加者 0 人）を回帰テストにする。

### Requirement 4: 非同期エラーを画面に出す（P0）

**User Story:** 利用者として、読み込みや入室に失敗したときは失敗したと分かってほしい。「発言がない部屋」と
区別できないと、待ち続けてしまうため。

#### Acceptance Criteria

1. WHEN 部屋ログの取得がリトライの後も失敗する, THE ChatRoute と ChanariChatPage SHALL 「まだ発言はありません。」
   ではなく、読み込みに失敗したことと再試行の導線を表示する。
2. WHEN 入室（Welcome の保存）が失敗する, THE EntryForm SHALL エラーメッセージを表示し、未処理の Promise
   rejection を出さない。
3. WHILE 入室の処理が進んでいる, THE ルート SHALL 入室フォームの代わりにチャット画面を表示し、入室の二重送信を
   できないようにする（現行どおり、入室は保存を待たずに画面を切り替える）。
4. WHEN ちゃなりの発言の保存が失敗する, THE ChanariChatRoom SHALL エラーメッセージを表示する。
5. THE UI の props（`onClick` / `onSubmit` など戻り値が `void` のもの）SHALL Promise を返す関数をそのまま
   受け取らない（Requirement 11 の lint で担保する）。

### Requirement 5: デッドコードと重複ユーティリティの削除（P1）

**User Story:** 開発者として、使われていないコードを読まずに済むようにしたい。変更の影響範囲を正しく見積もるため。

#### Acceptance Criteria

1. THE リポジトリ SHALL F6 で本番から到達しないと確認したモジュールと、そのテスト・stories を削除する
   （TermsModal 一式は 5 の判断に従う）。
2. THE `chatApi` と `chatAllSend` SHALL F6 で挙げた未使用の関数をエクスポートしない。
3. THE リトライと遅延計測のヘルパー SHALL 1 か所にまとまり、モジュールスコープの可変状態
   （`chatApi.ts` の `perfStartTime`）を持たない。
4. THE 依存関係 SHALL `uuid` と `@types/uuid` を含まない（`crypto.randomUUID()` に置き換える）。
5. THE リポジトリ SHALL 利用規約モーダルに関わるコードとドキュメント（TermsModal、Modal、
   `content/terms.mdx`、`@mdx-js/*`、vite.config の `mdx()`、eslint-plugin-mdx、関連する spec・README の記述）を
   削除する（Q1: 本番に戻す予定はない）。
6. THE ログ取得 SHALL オフライン時と認証エラー時に `mockChatData` を返す現行の挙動を保つ（Q2: 意図した挙動）。

### Requirement 6: チャットログの取得と購読を外部ストアにする（P1）

**User Story:** 開発者として、ログの取得・購読・取り直しの規則を 1 か所で読みたい。今は `reloadKey`、
`logLimit`、ref 2 本、Effect 2 本の組み合わせで表現されていて、変更するたびに競合を検証し直す必要があるため。

#### Acceptance Criteria

1. THE Room_Log_Store SHALL 部屋ごとに、スナップショットの取得、Realtime の購読、取得中に届いた発言のバッファ、
   接続確立時の取り直し、取得件数の拡張をまとめて持つ。
2. THE コンポーネント SHALL Room_Log_Store の状態を `useSyncExternalStore` で読む。購読の開始と終了は
   ストアの `subscribe` と参照カウントで決め、Effect の依存配列では制御しない。
3. WHEN 複数のコンポーネントが同じ部屋を購読する（StrictMode の二重マウントを含む）, THE Room_Log_Store SHALL
   Realtime の channel と進行中の取得を 1 つずつに共有する。
4. THE 全部屋まとめ SHALL 同じストアの実装を使い、接続確立時の取り直しを部屋単位のビューと同じ規則で行う。
5. THE Room_Log_Store SHALL 現行の挙動を保つ: 初期 10 件 → 入室で 100 件、行数の選択で最大 1000 件まで拡張、
   更新ボタンでキャッシュを使わずに取り直す、取得中に届いた発言を失わない、`SUBSCRIBED` に到達したら取り直す、
   取り直した結果で論理削除を反映する。
6. THE Room_Log_Store SHALL サーバーで確定した行だけを持ち, THE 楽観的な表示 SHALL ストアのスナップショットを
   基にした `useOptimistic` で行う。
7. THE Room_Log_Store SHALL 状態を `status`（`loading` / `ready` / `error`）、`chats`、`realtime`
   （`connecting` / `connected` / `disconnected`）で公開する。
8. THE `chatLogResource` の TTL キャッシュ、paging 用の Map、generation 管理 SHALL このストアへの置き換えと
   同時に削除される。

### Requirement 7: チャットセッション（入室・退室・送信）を 1 つにする（P1）

**User Story:** 開発者として、入室と送信の規則を 1 か所で直したい。今は部屋単位、全部屋まとめ、ちゃなりの
3 か所に似たコードがあり、直し漏れが起きるため。

#### Acceptance Criteria

1. THE Chat_Session SHALL 入室・退室・送信とコマンド（cut / clear / look / unlook / おみくじ）を、送信先
   （単一の部屋、または全部屋まとめの返信先）を引数にとる 1 つの実装で提供する。
2. THE ChatRoute、AllRoomsRoute、ChanariChatPage SHALL 名前・色・メール・アバター・入室状態を共通の
   Chat_Identity フックから得る。
3. THE Chat_Session SHALL 呼び出し元から `setState` 関数（setChatLog / setName / setMessage / setShowRanking
   など）を受け取らない。状態の変更は Chat_Session が返すアクションで行う。
4. THE 計測（conversationMeasurement）と analytics のイベント SHALL 現行と同じ順序・同じ内容で送られる。
5. WHEN clear コマンドが成功する, THE ログ表示 SHALL ログの state を直接書き換えるのではなく、Room_Log_Store の
   操作で自分の発言を取り除く。

### Requirement 8: フォームを React 19 の Actions に揃える（P1）

**User Story:** 利用者として、入力中に動作が重くならないでほしい。開発者として、送信・pending・エラーの扱いを
フォームごとに書き分けたくない。

#### Acceptance Criteria

1. THE ChatRoom SHALL `<form action={…}>` で送信し、`onSubmit` の中で `startTransition(dispatch)` を呼ばない。
2. THE 通常チャットの発言入力 SHALL 値を ChatRoom の中で持ち, THE ChatRoute と AllRoomsRoute SHALL 1 文字の
   入力で再レンダーしない。
3. WHEN 利用者が発言を送信する, THE 入力欄 SHALL 保存の完了を待たずに空になる（現行の挙動を保つ）。
4. THE EntryForm、ChanariEntryForm、ChanariChatRoom SHALL `useActionState` を使わず、失敗を明示的に受け取って
   表示する。Action の中の状態更新は Action の終わりにまとめて反映されるため、Action にすると入室の画面切り替えや
   入力欄のクリアが保存の完了まで遅れる（PR3 の実装で確認）。
5. THE ちゃなりの発言入力 SHALL 下書きの復元（「復元」ボタン）と、最後の発言の保存を今と同じように行う。

### Requirement 9: 永続化ストアの書き方を揃える（P1）

**User Story:** 開発者として、localStorage を読む状態を 1 つの書き方で扱いたい。SSG と hydration で安全かどうかを、
ストアごとに確かめ直したくないため。

#### Acceptance Criteria

1. THE settingsStore とちゃなりの draftStore SHALL 共通の Persistent_Store の上に作る。
2. THE `useChanariSettings` SHALL 下書きを `useSyncExternalStore` で読み、レンダー中と `useState` の初期化で
   localStorage を読まない。
3. THE `useChanariSettings` SHALL roomId が変わったときに読み直す Effect と、ref を同期する Effect を持たない
   （App が `key={roomId}` で再マウントするため）。
4. WHEN 別のタブで設定や下書きが変わる, THE 両方のストア SHALL `storage` イベントで追随する。

### Requirement 10: RetroSplitter を Pointer Events にする（P1）

**User Story:** スマートフォンの利用者として、上下の境界を指で動かしたい。

#### Acceptance Criteria

1. THE 分割バー SHALL `pointerdown` と `setPointerCapture` でドラッグでき、マウス・タッチ・ペンのどれでも
   操作できる。
2. THE RetroSplitter SHALL ドラッグ中に window へ `mousemove` / `mouseup` を登録せず、そのための `useCallback` も
   持たない。
3. WHILE 指でドラッグしている, THE 分割バー SHALL ページをスクロールさせない（`touch-action: none`）。
4. THE キーボード操作、aria 属性、`topKind` による初期の高さ、SSG 時の CSS 変数による初期の高さ SHALL
   現行と同じに動く。

### Requirement 11: 静的解析を強化する（P1）

**User Story:** 開発者として、await し忘れた Promise や async ハンドラの渡し間違いをレビューの前に見つけたい。

#### Acceptance Criteria

1. THE ESLint SHALL typescript-eslint の型情報を使うルール `no-floating-promises`、`no-misused-promises`、
   `no-explicit-any` を `src/` の本番コードに error として適用する。
2. WHEN ルールを有効にする, THE 既存の違反 SHALL 修正されるか、理由のコメント付きで抑制される（調査時点で
   Promise 関連 17 件、`any` 2 件）。
3. THE `pnpm lint` SHALL CI で型情報を使うルールを含めて実行される。

### Requirement 12: React 19.3 に上げて Activity と ViewTransition を使う（P2）

**User Story:** 利用者として、ランキングからログに戻ったときに、読んでいた位置が失われないでほしい。

#### Acceptance Criteria

1. THE `react` と `react-dom` SHALL 19.3 系に更新される。
2. WHEN 利用者がランキングからログ表示に戻る, THE ChatRoute SHALL ログ一覧を再マウントせずに表示する
   （ランキングを表示している間は `<Activity mode="hidden">` で残しておく）。
   2a. THE ログ一覧のスクロール位置 SHALL ランキングを開く前と同じに戻る。
3. WHERE ブラウザが View Transition API に対応している, THE ランキングとログの切り替え、入室フォームとチャット
   入力の切り替え SHALL `<ViewTransition>` でアニメーションする。
4. WHERE `prefers-reduced-motion: reduce` が有効, THE 切り替え SHALL アニメーションしない。
5. WHEN Realtime で発言が届く, THE ログ表示 SHALL アニメーションしない。

### Requirement 13: チャット系ルートの初期 JS を減らす（P2）

**User Story:** チャット部屋に直接来た利用者として、早く入室フォームを使いたい。

#### Acceptance Criteria

1. WHERE 事前の計測で、Supabase を機能別パッケージ（PostgREST / Realtime / Functions）に分けると 15 kB gz 以上
   減ると確かめられた, THE チャット系ルート SHALL `@supabase/supabase-js` ではなく、それらのパッケージだけを
   import する。
2. THE Supabase クライアント SHALL ブラウザが設定できないヘッダ（`Accept-Encoding`）と、使っていない独自ヘッダ
   （`X-My-Custom-Header`）を送らない。
3. THE Realtime の再接続、Edge Function の呼び出し（`x-chat-operation-id` と New Relic のトレース伝搬を含む）
   SHALL 現行と同じに動く。

### Requirement 14: トップの参加人数の集計をサーバーに移す（P2）

**User Story:** トップページの訪問者として、参加人数を早く見たい。発言本文を大量にダウンロードしたくない。

#### Acceptance Criteria

1. THE トップの参加人数の取得 SHALL `message` 列を取得しない（先行して対応できる）。
2. THE 集計 SHALL サーバー側のビュー（または RPC）が部屋ごとのユニーク発言者数を返し, THE 転送量 SHALL 発言の
   件数ではなく部屋の数に比例する。
3. THE 集計の規則 SHALL 現行の `aggregateCountsFromRows` と同じ結果になる: system 発言と管理人の発言を除く、
   論理削除を除く、直近 6 時間、一覧に出す部屋だけ。
4. THE ビュー SHALL 現行の anon の SELECT を超える権限を必要としない。

### Requirement 15: ビルド設定を Vite 8 に合わせ、SSG の API を更新する（P2）

**User Story:** 開発者として、非推奨の設定を使い続けて次のメジャー更新で壊れる事態を避けたい。

#### Acceptance Criteria

1. THE `vite.config.ts` SHALL `build.rollupOptions` ではなく `build.rolldownOptions` を使う。
2. THE チャンク分割 SHALL 関数形式の `manualChunks` ではなく Rolldown の `codeSplitting` で定義し、現行の
   チャンクの境界（vendor-react、vendor-supabase、preload-helper の分離）を保つ。
3. THE `entry-server.tsx` SHALL `react-dom/static` の `prerenderToNodeStream` で SSG する。
4. THE プリレンダの出力 SHALL 移行前と同じく `data-ssg="1"` と modulePreload を持ち、hydration の不一致を
   起こさない。
5. WHERE Oxc の minify 結果（gzip）が terser と比べて 1% 以内に収まる, THE ビルド SHALL Vite 8 の既定である
   Oxc で minify する。

### Requirement 16: ページ間の遷移方式を決める（P2、スパイク）

**User Story:** 利用者として、トップから部屋へ移るときに待たされたくない。開発者として、クライアントルーターを
作るかどうかを根拠をもって決めたい。

#### Acceptance Criteria

1. THE チーム SHALL Navigation_Strategy を、スパイクで測った値（トップ → 部屋の遷移時間、Realtime の再接続に
   かかる時間、実装量）をもとに決め、design.md に記録する。
2. WHERE MPA の方式を選ぶ, THE トップ SHALL 部屋へのリンクに Speculation Rules（`prefetch`、`eagerness: moderate`）
   を付け, THE 非対応ブラウザ SHALL 今と同じに動く。
3. WHERE MPA の方式を選ぶ, THE CSS SHALL `@view-transition { navigation: auto; }` を持ち、
   `prefers-reduced-motion: reduce` では無効にする。
4. THE 決定 SHALL `top-and-transition-performance` の Requirement 4 と 5 を置き換えるのか、続けるのかを明記する。

### Requirement 17: 長いログの描画コストを下げる（P3、任意）

**User Story:** 行数を 1000 にした利用者として、発言が届くたびに画面が引っかからないでほしい。

#### Acceptance Criteria

1. WHEN 発言が 1 件届く, THE ログのマージ SHALL ソート済みのログ全体を並べ直さず、挿入する位置だけを探す。
2. THE UUID の比較 SHALL `localeCompare` ではなく、文字コードの比較で行う。
3. WHERE 表示する行数が 200 を超える, THE 発言の行 SHALL `content-visibility: auto` で画面外の描画を省く。

### Requirement 18: ドキュメントの整合と検収（横断）

#### Acceptance Criteria

1. THE CLAUDE.md と `docs/ARCHITECTURE.md` SHALL 各 PR の変更（コンパイラの適用範囲、手動メモ化を残す例外、
   ログ取得の流れ、削除したモジュール）を反映する。
2. WHEN PR をマージする, THE PR SHALL `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build:prod` を通る。
3. THE 性能に関わる PR SHALL 変更前後のチャンクサイズ（gzip）を PR 本文に書く。

## Non-Goals

- **RSC、Next.js、React Router の framework mode への移行。** GitHub Pages の静的配信でサーバーがない。
  2025-12 の RSC の脆弱性の対象範囲に入るだけで、このアプリにとっての利点が小さい
- **TanStack Query や Zustand などの導入。** 扱うリソースは実質チャットログ 1 種類で、Realtime での push が中心。
  自前のストア（Requirement 6）で足り、初期 JS も増えない
- **useSEO を React 19 のネイティブのメタデータ（`<title>` / `<meta>` の hoisting）に置き換えること。**
  SSG のテンプレートに入っている meta と二重になり、クローラ向けの meta は静的 HTML に必要なため、今回は
  見送る
- フォント、SSG の導入、サードパーティの遅延化（`top-and-transition-performance` が扱う）
- Vitest のメジャー更新（`post-deps-modernization-followup` R3 が扱う）
- 見た目（旧お気楽チャットの再現）の変更
- DB スキーマの変更（Requirement 14 のビューの追加を除く）

## Decisions（2026-09-23 回答済み）

- **Q1:** 利用規約モーダルは本番に戻さない。関連する処理とドキュメントをすべて削除する（R5.5）
- **Q2:** オフライン時と認証エラー時に架空の発言を表示するのは意図した挙動。変更しない（R5.6）
- **Q3:** ページ遷移は全ページ読み込み（MPA）のままにし、ドキュメント間 View Transitions と Speculation Rules
  で滑らかにする（R16 の方式 A）

## Success Metrics

| 指標                                                                                        | 現状（調査時点）                               | 目標                              |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------- |
| React Compiler で未コンパイルの関数（opt-out 以外）                                         | 18（CompileError 21 件）                       | 0                                 |
| 保存の解決前に楽観的なチャットが表示される経路（通常の発言 / ちゃなりの発言 / 入室 / 退室） | 1 / 4                                          | 4 / 4                             |
| 5 分を過ぎた発言者が参加者一覧から消えるまで                                                | 次の発言が届くまで                             | 5 分を過ぎてから 1 分以内         |
| 型情報を使う lint の違反（Promise 関連 / `any`）                                            | 17 / 2                                         | 0 / 0                             |
| 入室・退室・送信のフック                                                                    | 2（useChatHandlers / useAllRoomsChatHandlers） | 1（Chat_Session）                 |
| 入室者の状態（名前・色・メール・アバター・入室）を持つ場所                                  | 3 ルートがそれぞれ持つ                         | 1（Chat_Identity）                |
| 本番から到達しないモジュール                                                                | 11 ファイル（約 560 行）                       | 0                                 |
| チャット系ルートの初期 JS（gzip、modulePreload の合計）                                     | 約 153 kB                                      | −15 kB 以上（R13 を採用した場合） |
| トップの参加人数取得のレスポンス                                                            | 最大 5000 行（本文を含む）                     | 部屋の数の行                      |
