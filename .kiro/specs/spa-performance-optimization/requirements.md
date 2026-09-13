# Requirements Document: spa-performance-optimization

## Introduction

ゆいちゃっとTS（yui-chat-ts）の SPA としてのパフォーマンスを最大化するため、初期 JS バンドルサイズ・入力時の再レンダ範囲・データ取得の重複・realtime 接続コスト・トップページからの遷移体感・障害時のフォールバックの 6 観点を改善する。

現状の主要ボトルネックは以下の通り：

- `App.tsx` がルート判定と同時に `useChatLog` / `useParticipants` / `useChatHandlers` / `EntryForm` / `ChatRoom` / `RetroSplitter` / `ChatRanking` をすべて eager import しているため、`/` 訪問者にもチャット一式が初回バンドルに含まれる。
- `ChatPage` が `message` / `name` / `color` / `email` / `windowRows` などの入力 state を親で保持しているため、1文字入力するたびに `RetroSplitter` を経由して `ChatLogList` 配下まで再レンダリングが伝播する。
- `ChatLogList` が毎レンダ `sortChatsByTime([...chatLog])` を実行している。`loadChatLogs` は `.order('uuid', { ascending: false })` で降順を保証し、`useChatLog.mergeChat` も先頭追加するため、ソートは設計上不要。
- `useParticipants` の `useDeferredValue` 使用が誤っており、defer 前に同期計算が走るためアンチパターンになっている。
- `earlyDataFetch` と `useChatLog` の初回取得が in-flight Promise を共有していないため、同じ room を二度ネットワークに出す可能性がある。`loadChatLogs` と `loadChatLogsWithPaging` の API も二系統に分かれており、キャッシュキーは共有しているが in-flight 共有はない。
- `subscribeChatLogs` は呼び出しごとに新規チャネルを作成し、`broadcastChannels` のような共有・参照カウント機構がないため、StrictMode の二重マウントや handler 参照変化で余分な realtime 接続が発生する。
- `useChatHandlers` の `handleSend` などが `name` / `color` / `email` を依存配列に持ち、入力ごとに参照が変わるため、memo 化前提を整えられていない。
- `TopPage` は静的なリンク集だが、`useRoomCounts` の Supabase fetch を待ってから人数バッジが描画される構成で LCP に影響する。また、ルームリンクからの遷移時にチャンクとデータの先読みがない。
- `RetroSplitter` がメモ化されておらず、`top` / `bottom` の JSX を毎回新規生成しているため、親が再レンダするたびに `ResizeObserver` / `useLayoutEffect` を内包する重いコンポーネントが再評価される。
- `Suspense fallback={null}` が App.tsx で使われており、lazy チャンクのロード失敗時にホワイトスクリーンになる。Route 単位 lazy で表面化リスクが高まる。
- Supabase ドメインへの `preconnect` を `preloadCriticalResources` から動的に挿入しているが、ChatPage マウント後に実行されるため、先行接続の効果が出ていない。

## Glossary

- **App_Router**: `src/App.tsx` の `resolveRoute` を中心とするクライアントサイドルーター
- **Top_Route**: `/` を担当する `TopPage` を遅延ロードするルートエントリ
- **Chat_Route**: `/chat/:roomId` を担当する `ChatPage` を遅延ロードするルートエントリ
- **Chanari_Route**: `/chanari/:roomId` を担当する `ChanariChatPage` を遅延ロードするルートエントリ
- **Chat_Page_Shell**: `ChatPage` の最上位ラッパー。`entered` / `showRanking` / `windowRows` / `chatRoomKey` / `identityRef` のみを持ち、文字入力系 state は持たない
- **Entry_Form_Container**: 入室前の入力 state（name / color / email / avatar / silent）を内部に閉じ込めた EntryForm のコンテナ
- **Chat_Room_Container**: 入室後の入力 state（message / fontSize / fontColor / bold）を内部に閉じ込めた ChatRoom のコンテナ。windowRows は Chat_Page_Shell から prop で受け取り、setter コールバックを呼ぶ
- **Chat_Log_Resource**: roomId 単位の snapshot 取得と in-flight Promise 共有を担うデータリソース層
- **Realtime_Channel_Registry**: roomId 単位の Postgres Changes チャネルを共有し、参照カウントで lifecycle を管理するレジストリ
- **Room_Prefetcher**: TopPage のルームリンクから Chat_Route チャンクと Chat_Log_Resource を hover/focus/touchstart で先読みするユーティリティ、および first paint 後の idle 先読みを担う
- **Participants_Selector**: chatLog から参加者リストを派生する純関数 `getRecentParticipants` の memo 化呼び出し層
- **Lazy_Route_Host**: 各ルートの `React.lazy` 参照を `useState` で保持し、Route_Error_Boundary から retry 通知を受けたときに lazy 参照を再生成する仲介コンポーネント
- **Route_Error_Boundary**: lazy ルートのチャンクロード失敗および render error をハンドリングする ErrorBoundary。retry 時に親へ通知して lazy 参照の再生成を促す
- **Identity_Ref**: 入室時点での name / color / email / avatar を mutable ref で保持し、入室後の ChatRoom 表示に snapshot として供給する参照
- **Network_Heuristics**: `navigator.connection` を読み取り、低速回線・データセーバー時のプリフェッチ抑制を判定するユーティリティ

## Requirements

### Requirement 1: ルート単位の Code Splitting

**User Story:** SPA 訪問者として、TopPage のみを閲覧する場合にチャット機能のコードをダウンロードしたくない。初回表示を高速化するため。

#### Acceptance Criteria

1. WHEN App_Router がマウントされる, THE App_Router SHALL `TopPage` / `ChatPage` / `ChanariChatPage` / `NotFoundPage` を `React.lazy` 経由でのみ参照する。
2. THE App_Router SHALL `useChatLog` / `useParticipants` / `useChatHandlers` / `useLookSound` / `EntryForm` / `ChatRoom` / `RetroSplitter` / `ChatRanking` を直接 import しない。
3. WHEN ビルドが完了する, THE ビルド成果物 SHALL `TopPage` を含むチャンクと `ChatPage` を含むチャンクを別ファイルとして出力する。
4. WHEN ユーザーが `/` を訪問する, THE ブラウザ SHALL chat 専用コード（`useChatLog` / `useParticipants` / `useChatHandlers` / `EntryForm` / `ChatRoom` / `RetroSplitter` / `ChatRanking` / `ChatLogList` を含む chat feature の関数群）を初期ロードでは取得しない。
5. WHEN ルート遷移が `redirect` 種別を返す, THE App_Router SHALL `history.replaceState` で URL を書き換えた後、再度ルート解決を行う既存仕様を維持する。

### Requirement 2: 入力 state の局所化

**User Story:** チャットユーザーとして、メッセージや名前を入力している間に画面が重くなってほしくない。入力フィードバックを軽快に保つため。

#### Acceptance Criteria

1. WHEN ユーザーが Entry_Form_Container の入力欄（名前・色・メール・アバター・こっそり）を編集する, THE Chat_Page_Shell SHALL 再レンダリングされない。
2. WHEN ユーザーが Chat_Room_Container の発言・フォントサイズ・色・太字を編集する, THE Chat_Page_Shell SHALL 再レンダリングされない。
3. WHEN ユーザーが Entry_Form_Container の入室ボタンを押下する, THE Entry_Form_Container SHALL 入室処理に必要な値（name / color / email / avatar / silent）をコールバック引数として親に渡す。
4. WHEN ユーザーが Chat_Room_Container の発言を送信する, THE Chat_Room_Container SHALL 発言文字列とメタデータをコールバック引数として親に渡す。
5. WHEN Chat_Room_Container がマウントされる, THE Chat_Room_Container SHALL `useChatLog` から得たログ更新の伝播経路（メッセージ追加 → ChatLogList 再描画）を阻害しない。
6. WHEN 入室前後で同じユーザー名・色・メール・アバターが必要な場面が存在する, THE Chat_Page_Shell SHALL Identity_Ref（`useRef<{name, color, email, avatar}>`）に Entry_Form_Container から受け取った値を入室時点で保存し、ChatRoom 表示に prop として渡す。
7. THE windowRows SHALL Chat_Page_Shell の state として管理される。Chat_Room_Container には `windowRows` 値と `setWindowRows` を prop で渡し、ChatLogList には `windowRows` 値を prop で渡す。windowRows 変化時の再レンダは Chat_Page_Shell から始まるが、`top` / `bottom` の `useMemo` 化により message / フォントスタイル / 名前・色等の入力変化では Chat_Page_Shell は再レンダされない。
8. WHEN ユーザーが入室する, THE Identity_Ref SHALL 入室時点での name / color / email / avatar の snapshot を保持する。入室後の name / avatar 変更 UI は提供しない（Identity_Ref は読み取り専用 snapshot として扱う）。
9. WHEN Chat_Room_Container の `chatRoomKey` が変化する, THE Chat_Room_Container SHALL 再 mount され、内部の message / fontSize / fontColor / bold が初期値にリセットされる（退室時の入力クリア）。

### Requirement 3: ChatLogList の派生値メモ化と不要ソート除去

**User Story:** チャットユーザーとして、長いチャットログを表示している時にも入力やスクロールが滑らかであってほしい。CPU 時間を無駄遣いしないため。

#### Acceptance Criteria

1. THE Chat_Log_List SHALL レンダリング中に `sortChatsByTime` を呼び出さない。
2. WHEN Chat_Log_Resource が `chatLog` を提供する, THE Chat_Log_Resource SHALL 配列が常に降順（新しい順）でソート済みであることを保証する。
3. WHEN `chatLog` と `windowRows` の参照が変化しない, THE Chat_Log_List SHALL 表示用配列（`slice(0, windowRows)` の結果）を再計算しない。
4. THE Chat_Log_List SHALL `React.memo` でラップされ、`chatLog` / `windowRows` / `isLoading` の参照がいずれも変化していない親再レンダでは render 本体を skip する。`useDeferredValue` の deferred 値が commit されるタイミングで内部的に追加 render が走ることはこの条件の例外として許容する。
5. THE Chat_Message SHALL 個別の `chat` プロップが参照同一性を維持する限り再レンダリングされないよう `React.memo` で包まれる。
6. THE underlying `chatLog` SHALL 常に server UUID のチャットのみを保持し、`mergeChat` の findIndex は server UUID 同士の比較で動作する（temp UUID は `chatLog` に書き込まれない）。WHEN 楽観的更新で一時 UUID (`temp-*`) を持つチャットが addOptimistic で表示中に、対応する savedChat が `saveChatLogOptimistic` 応答または realtime INSERT 経由で `chatLog` に追加される, THE `useChatLog` の `useOptimistic` reducer SHALL base state（`chatLog`）に同一 `client_time` のエントリが存在する場合、temp 行の prepend を抑制する。これにより temp と savedChat が transition 中に同時表示される重複を防ぐ。
7. THE ParticipantsList SHALL 表示用の `[HH:MM]` 現在時刻を内部の timer hook で 60 秒間隔に更新する。Chat_Log_List から `currentTime` 値を prop で受け取ることをやめ、`ChatLogList` の render 頻度から表示時刻を切り離す。

### Requirement 4: Participants 算出の defer + memoization

**User Story:** チャットユーザーとして、新着メッセージ受信時に参加者リストの更新が入力体験を阻害しないでほしい。重い計算をブロッキングしないため。

#### Acceptance Criteria

1. WHEN `useParticipants(chatLog)` が呼ばれる, THE Participants_Selector SHALL `useDeferredValue(chatLog)` を経由した deferred 値に対してのみ `getRecentParticipants` を実行する。
2. THE Participants_Selector SHALL `useMemo` により deferred 値の参照が変化したときのみ参加者配列を再計算する。
3. WHEN `chatLog` の参照が変化していない, THE Participants_Selector SHALL `getRecentParticipants` を再実行しない。
4. THE getRecentParticipants の入出力契約 SHALL 既存呼び出し側（`ChatLogList` 内部で利用）と互換である。

### Requirement 5: チャットログ取得の dedupe と API 一本化

**User Story:** SPA として、同じ room の初回ログを 2 回フェッチしたくない。ネットワーク往復と Supabase の負荷を抑えるため。

#### Acceptance Criteria

1. WHEN Chat_Route がマウントされ `earlyDataFetch(roomId)` と `useChatLog(roomId)` の初回取得が同時に走る, THE Chat_Log_Resource SHALL 同一 roomId に対するネットワークリクエストを 1 件のみ発行する。
2. THE Chat_Log_Resource SHALL roomId をキーとする `Map<RoomId, Promise<Chat[]>>` 形式の in-flight Promise レジストリを保持する。
3. WHEN in-flight Promise が存在する状態で同じ roomId に対する取得要求が来る, THE Chat_Log_Resource SHALL 既存 Promise を共有して返す。
4. WHEN 取得が成功または失敗で確定する, THE Chat_Log_Resource SHALL 該当 roomId の in-flight エントリを削除する。
5. THE Chat_Log_Resource SHALL 既存の `chatLogsCache`（5 分 TTL）を保持し、stale-while-revalidate 風の挙動（キャッシュがあれば即時返却し、必要に応じてバックグラウンド更新）を許容する。
6. THE Chat_Log_Resource SHALL `loadChatLogs` と `loadChatLogsWithPaging` の重複実装を 1 つの内部関数に統合し、公開 API として `loadChatLogs` と `loadChatLogsWithPaging` の既存シグネチャは互換維持する。
7. WHEN 取得結果が返る, THE Chat_Log_Resource SHALL 配列を降順整列済みとして提供し、Chat_Log_List 側のソートを不要にする。
8. THE Chat_Log_Resource SHALL `loadChatLogs(roomId)` を canonical snapshot として常に `MAX_CHAT_LOG=100` 件で取得し、in-flight Map のキーは roomId 単独とする。呼び出し側で必要な行数（例: windowRows）は取得後の slice で対応する。
9. WHERE `loadChatLogsWithPaging(roomId, offset, limit)` が呼ばれる, THE Chat_Log_Resource SHALL `offset === 0 && limit <= MAX_CHAT_LOG` の場合は canonical snapshot からの `slice(0, limit)` で応答し、`offset > 0` の場合のみ独立した Supabase クエリを発行する。`offset > 0` クエリの in-flight キーは `(roomId, offset, limit)` のタプル文字列とし、roomId 単独 in-flight とは共有しない。

### Requirement 6: Realtime Channel の共有と段階起動

**User Story:** SPA として、StrictMode の二重マウントや handler 参照変化で realtime 接続が増えないでほしい。Supabase の同時接続上限を圧迫せず、初回描画も阻害しないため。

#### Acceptance Criteria

1. THE Realtime_Channel_Registry SHALL roomId 単位で `postgres_changes` チャネルを共有する。
2. WHEN `subscribeChatLogs(roomId, cb)` が呼ばれる, THE Realtime_Channel_Registry SHALL roomId に対応する単一チャネルにコールバックを add し、参照カウントを 1 加算する。
3. WHEN `subscribeChatLogs` の返り値の `unsubscribe` 相当が呼ばれる, THE Realtime_Channel_Registry SHALL 参照カウントを 1 減算し、0 になったときにチャネル自体を `removeChannel` で解放する。
4. WHEN 同じ roomId に対する複数の subscriber が存在する, THE Realtime_Channel_Registry SHALL Postgres Changes イベントを全てのコールバックに dispatch する。
5. WHEN Chat_Page_Shell がマウントされる, THE Chat_Page_Shell SHALL realtime 購読を first paint 完了後（`requestIdleCallback` または `setTimeout(0)` 相当）に開始する。
6. WHERE `requestIdleCallback` がブラウザに存在しない場合, THE Chat_Page_Shell SHALL `setTimeout(fn, 0)` でフォールバックする。
7. THE Realtime_Channel_Registry SHALL 既存の `loadChatLogs` キャッシュ無効化フローと衝突しない。

### Requirement 7: useChatHandlers の参照安定化

**User Story:** 開発者として、`React.memo` で塞いだコンポーネントが props 不一致で素通りしないでほしい。memo 化を実効的に機能させるため。

#### Acceptance Criteria

1. WHEN `name` / `color` / `email` の値が変化する, THE useChatHandlers SHALL `handleSend` / `handleEnter` / `handleExit` / `handleReload` の関数参照を変化させない。
2. THE useChatHandlers SHALL 最新の `name` / `color` / `email` 値を Identity_Ref 経由で参照する。
3. WHEN `roomId` が変化する, THE useChatHandlers SHALL ハンドラ群の関数参照を更新してよい（roomId は ChatPage のライフタイムに対して変化頻度が低いため）。
4. THE useChatHandlers の公開シグネチャ SHALL 呼び出し側（Chat_Page_Shell または Chat_Room_Container）に必要な変更を最小化する。
5. WHEN Chat_Page_Shell が `onSend={(msg, metadata) => handleSend(msg, metadata)}` のような薄いラッパーを介してハンドラを渡している, THE Chat_Page_Shell SHALL 関数参照をそのまま渡す形に変更する。

### Requirement 8: TopPage の段階描画・遷移先プリフェッチ・idle 先読み

**User Story:** TopPage 訪問者として、ページ表示が Supabase レスポンス待ちで遅れないでほしい。また、チャットリンクをクリックしたときに体感ゼロで遷移したい。Chat への遷移はほぼ確実なので、TopPage の描画を阻害しない範囲で先読みしてほしい。

#### Acceptance Criteria

1. WHEN TopPage の初回レンダリングが行われる, THE TopPage SHALL `useRoomCounts` の結果を待たずに静的部分（リンク・ニュース・コミュニティー）を描画する。
2. WHEN `useRoomCounts` がデータを返す前, THE CountBadge SHALL 0 人表示（既存のフォールバック）を維持する。
3. WHEN `useRoomCounts` がデータを返す, THE CountBadge SHALL 該当 room の値で表示を更新する。
4. WHEN ユーザーがルームリンクに `mouseenter` / `focus` / `touchstart` のいずれかのイベントを発火させる, THE Room_Prefetcher SHALL Chat_Route のチャンクを動的 import で先読みする。
5. WHEN 同じイベントが発火し、リンク先 `roomId` が判定可能である, THE Room_Prefetcher SHALL `Chat_Log_Resource.prefetchChatLogs(roomId)` を発火する。
6. THE Room_Prefetcher SHALL 同一リンクに対するプリフェッチ発火を 1 回に制限し、二重発火を防ぐ（per-link フラグまたは in-flight Map で dedupe）。
7. WHERE リンクが外部リンクである、または `roomId` が解決できない, THE Room_Prefetcher SHALL プリフェッチを発火しない。
8. WHEN TopPage の first paint が完了する, THE Room_Prefetcher SHALL `requestIdleCallback` または `setTimeout(fn, 1500)` フォールバックを介して Chat_Route のチャンクを先読みする。
9. WHERE `navigator.connection.saveData === true` または `navigator.connection.effectiveType` が `'slow-2g'` / `'2g'`, THE Network_Heuristics SHALL Room_Prefetcher の idle 先読みをスキップさせる。
10. WHEN localStorage に最後に訪問した roomId（`yui-chat-settings.lastRoomId` 等の既知キー）が記録されている, THE Room_Prefetcher SHALL idle 先読みの際にその roomId に対する `Chat_Log_Resource.prefetchChatLogs` も発火する。
11. WHEN hover/focus/touchstart で既にプリフェッチ済みのリンクに idle 先読みが到達する, THE Room_Prefetcher SHALL 重複発火しない（共有の dedupe 機構を利用）。
12. THE Room_Prefetcher の idle 先読み SHALL TopPage の LCP / TTI / INP のいずれにも悪化を生じさせない（描画タスクをブロックしない）。

### Requirement 9: RetroSplitter のメモ化と top/bottom 安定参照化

**User Story:** チャットユーザーとして、入力中以外の操作（windowRows 切替・ランキング表示など）でも `ResizeObserver` / `useLayoutEffect` を持つ重い分割バーが再評価されないでほしい。

#### Acceptance Criteria

1. THE RetroSplitter SHALL `React.memo` でデフォルト export がラップされる。
2. WHEN Chat_Page_Shell が再レンダする, THE Chat_Page_Shell SHALL RetroSplitter に渡す `top` / `bottom` の `ReactNode` 参照を `useMemo` で安定化させ、依存値が変化していない場合に同一参照を保持する。
3. WHEN `top` 側のコンテンツが `EntryFormContainer` と `ChatRoomContainer` の間で切り替わる, THE Chat_Page_Shell SHALL `entered` / `chatRoomKey` / `windowRows` / ハンドラ参照のいずれかが変化したときのみ `top` の `ReactNode` 参照を新規化する。
4. WHEN `bottom` 側のコンテンツが `ChatLogList` と `ChatRanking` の間で切り替わる, THE Chat_Page_Shell SHALL `showRanking` / `chatLog` / `isLoading` / `windowRows` のいずれかが変化したときのみ `bottom` の `ReactNode` 参照を新規化する。
5. WHEN message / fontSize / fontColor / bold / name / color / email の入力が変化する, THE Chat_Page_Shell の `top` / `bottom` の `useMemo` 参照は変化しない（これらの state は Container 内に閉じるため Chat_Page_Shell から見えない）。
6. THE RetroSplitter の既存のキーボード操作 / ResizeObserver / ジオメトリ計測 SHALL 変更されない（挙動互換）。

### Requirement 10: Lazy ルートの ErrorBoundary と Suspense fallback

**User Story:** SPA 訪問者として、デプロイ直後やネットワーク不調で lazy チャンクの取得に失敗してもホワイトスクリーンにならず、再試行できる手段を提示してほしい。

#### Acceptance Criteria

1. WHEN App_Router が lazy ルートをレンダリングする, THE App_Router SHALL `Suspense` の `fallback` を `null` 以外（最低限「読み込み中」相当のテキスト）にする。
2. WHEN lazy ルートが Route_Error_Boundary 配下でレンダリングされる, THE App_Router SHALL 各 Route（`Top_Route` / `Chat_Route` / `Chanari_Route` / `NotFoundRoute`）を Lazy_Route_Host 単位で個別の Route_Error_Boundary でラップする（複数 Route が 1 つの Boundary を共有しない）。
3. WHEN `import()` がネットワーク失敗（`ChunkLoadError` / `TypeError: Failed to fetch dynamically imported module` 等）でリジェクトする, THE Route_Error_Boundary SHALL ユーザー向けに「読み込みに失敗しました。再試行」ボタンを含むフォールバック UI を表示する。
4. WHEN 再試行ボタンが押下される, THE Route_Error_Boundary SHALL 内部の `error` state をクリアした上で、親 Lazy_Route_Host に通知して `React.lazy` 参照を再生成させる。新しい lazy 参照に対する render により `import()` が再発火する。
5. THE Lazy_Route_Host SHALL `React.lazy` の payload キャッシュ（一度 reject すると同じ Error を保持し続ける挙動）を回避するため、`useState` で lazy 参照を保持し、retry 通知を受けたときに `lazy(factory)` を新規生成して state に書き込む。
6. WHEN チャンクロード以外の render error が発生する, THE Route_Error_Boundary SHALL チャンクエラーと区別したフォールバック UI（汎用エラー表示）を提供し、再試行ではなく `/` への戻り導線を提示する。
7. THE Route_Error_Boundary SHALL initial bundle に含まれる軽量実装である（外部ライブラリ非依存、class component で実装可能な範囲）。
8. THE Suspense fallback と Route_Error_Boundary のフォールバック UI SHALL Tailwind CSS のみで実装され、追加 CSS チャンクを発生させない。

### Requirement 11: index.html の静的プリコネクトと modulePreload 整理

**User Story:** SPA 訪問者として、Supabase ドメインへの最初のリクエストが DNS / TLS のラウンドトリップで待たされないでほしい。また、lazy チャンクの取得が遷移時に余計に遅れないでほしい。

#### Acceptance Criteria

1. THE `index.html` SHALL Supabase ドメイン (`https://tklxdjqlvwntdsfxfcwo.supabase.co`) に対する `<link rel="preconnect" crossorigin>` と `<link rel="dns-prefetch">` を静的に含む。
2. WHEN App がマウントされ `preloadCriticalResources` 相当の処理が呼ばれていた箇所が存在する, THE 該当処理 SHALL 削除されるか、index.html のヒントと冪等に共存する（重複した `<link>` を DOM に挿入しない）。
3. WHEN ビルドが完了する, THE Vite SHALL Route_Error_Boundary を含む initial chunk に対して `modulePreload` を生成し、 `<link rel="modulepreload">` を `dist/index.html` に出力する。
4. WHEN Top_Route / Chat_Route / Chanari_Route の動的 import が解決される, THE Vite SHALL それらの推移的依存チャンクへの `<link rel="modulepreload">` を該当チャンクのロード時に発火する（既定の Vite の挙動を維持する）。
5. THE `index.html` SHALL クリティカルパスに不要な `<link rel="preload">` を含まない（フォントや画像の不要な preload で帯域を奪わない）。
6. WHERE `preloadCriticalResources` の機能（DNS prefetch / preconnect）が `index.html` に移管された場合, THE ChatPage SHALL `preloadCriticalResources` の呼び出しを削除する。

## Non-Goals

以下は本 spec のスコープ外とする：

- `@supabase/supabase-js` を TopPage から完全に排除する（room counts の REST 直叩き化）。spec 範囲外の別最適化。本 spec では `vendor-supabase` チャンクが TopPage 初期ロードに含まれることを許容する。
- ChatLogList の仮想スクロール導入（`@tanstack/react-virtual`）。現状の `windowRows` 上限（100）であれば不要。
- TopPage の画像 WebP/AVIF 変換、`<img width/height>` 明示、`font-yui` の subset 化。SEO / CLS 系の別 spec で扱う。
- ライブラリ依存の追加（TanStack Query / SWR / Zustand / react-error-boundary など）。既存 Map ベースキャッシュの強化と素の class component で完結させる。
- 入室後の name / color / email / avatar 変更 UI の提供。Identity_Ref は入室時 snapshot として扱い、変更したい場合は退室 → 再入室の既存フローで対応する。
- サーバーサイドレンダリング（SSR / SSG）への移行。
- Service Worker / PWA 化。
- Tailwind CSS の production サイズ最適化（実測してからの別判断）。

## Success Metrics

- TopPage 訪問者（`/`）の初回 JS 転送量が現状比で **30% 以上削減**される。`pnpm build` 後の `dist/index.html` の `<script>` および `<link rel="modulepreload">` から得られる initial bundle セットに、chat 専用コード（`EntryForm` / `ChatRoom` / `RetroSplitter` / `ChatRanking` / `ChatLogList` / `useChatLog` / `useChatHandlers` / `useParticipants` 等の関数名）が含まれないことを `grep` で検証する。`vendor-supabase` は `useRoomCounts` の依存として initial bundle に残り続けてよい（別 spec で対応）。
- ChatPage 入室後の発言入力中、`ChatLogList` の commit が React DevTools Profiler で **キーストロークごとに発生しない**ことを確認する。
- 同一 roomId への初回ログ取得の Supabase リクエスト数が **1 件に減る**（Network タブで確認）。
- Lighthouse の Performance スコアが TopPage / ChatPage いずれも現状以上を維持する。
- Lazy チャンクのネットワーク失敗を再現したテストで、Route_Error_Boundary のフォールバック UI が表示され、再試行ボタンで `import()` が再発火することを確認する。
- TopPage 表示後 5 秒以内に Chat_Route チャンクが prefetch されていることを Network タブで確認する（高速回線時）。
