# Implementation Plan: two-shot-chat

## PR の順序

サーバー → 見た目 → 状態 → 切り替えの順に出す。Task 8（切り替え）をマージするまで、`/chat/2shot/` は今の通常の部屋の
ままで、ほかの PR は利用者から到達しない。

| PR  | Task       | 要件                               | 種別               | 規模   | 備考                                                                                          |
| --- | ---------- | ---------------------------------- | ------------------ | ------ | --------------------------------------------------------------------------------------------- |
| PR1 | —          | —                                  | spec               | 小     | 本 spec。Q1〜Q7 は推奨どおり決定（2026-09-24）                                                |
| —   | Task 0     | R18                                | 準備（PR なし）    | 小     | Oracle と参照スクリーンショット。リポジトリの外に置く                                         |
| PR2 | Task 1     | R5 / R9 / R10 / R12 / R18          | サーバー（純粋）   | 中     | `rules.ts` と Vitest。デプロイしない                                                          |
| PR3 | Task 2     | R12 / R14 / R15                    | サーバー + DB + CI | 大     | マイグレーション、Edge Function、`config.toml`。マージ後に DB → Edge の順で反映               |
| PR4 | Task 3 + 4 | R2 / R3 / R4 / R6 / R7 / R11 / R17 | 見た目             | 大     | 部品とストーリー。Oracle と見比べる。どこからも import しない                                 |
| PR5 | Task 5 + 6 | R8 / R11 / R12 / R13 / R17         | 状態               | 中〜大 | API クライアント、ストア、Action、自動更新                                                    |
| PR6 | Task 7     | R7.10                              | 見た目（任意）     | 小     | 文字参照の展開（P2）。PR5 の後ならいつでも                                                    |
| PR7 | Task 8     | R1 / R15 / R16                     | 切り替え           | 中     | `/chat/2shot/` を切り替える。**Q4(b) の保存・削除ジョブと監視の検証、現行ルートの確認が前提** |
| PR8 | Task 9     | R16.3 / R18                        | 検収               | 小     | CLAUDE.md、Oracle との比較の記録、Success Metrics の計測                                      |

## Tasks

- [ ] 0. Oracle を用意する（Requirement 18、PR なし）
  - [ ] 0.1 `2shot_5.0.1.gz` をリポジトリの外に展開し、`jcode.pl` の `do convf(*_);` を `&convf(*_);` に直す
    - `$URL` を相対パス（`2shot.cgi`）にする
    - _Requirements: 18.1_
  - [ ] 0.2 design.md「テスト戦略」の S1〜S11 の状態を Oracle で作り、各画面の HTML を保存するスクリプトを書く
    - 入室後の画面は `entry` の応答から認証コードを取り出して `ChatForm` / `Chat` を呼ぶ
    - フレームの `src` を保存した HTML に差し替えた静的なページを作る
    - _Requirements: 18.1_
  - [ ] 0.3 静的なページをアプリ内ブラウザ（Chromium）で 1280×800 と 375×812 で開き、スクリーンショットを撮る
    - Frame_Border の描き方（色と幅）と、既定のフォント・文字の大きさをここで確かめ、design.md §4 / §5 に書き足す
    - _Requirements: 2.4, 18.1_

- [x] 1. 状態遷移の規則を純粋な関数で書く（Requirement 5 / 9 / 10 / 12、PR2）
  - [x] 1.1 `supabase/functions/two-shot/rules.ts` に定数（`ROOM_IDS`、`MAX_LINES`、`LOG_SIZE_LIMIT`、`IDLE_SECONDS`、
        `NAME_MAX`、`PROFILE_MAX`、入室受付・保持期限）と型（`RoomState`、`Member_ID` に対応するフィールド、`Command`、`Context`、`Outcome`）を置く。import を持たせない
    - _Requirements: 14.4_
  - [x] 1.2 `sjisSize` / `logSize`（コードポイント単位の概算、通知も同じ本文定義）、匿名化、切り詰め
        （名前 30 / プロフィール 60 コードポイント → 匿名化の順）を書く
    - _Requirements: 5.4, 5.9, 10.3_
  - [x] 1.3 `applyCommand` を design.md §6 の順序（正規化 → 入室 / 認証 → 書き込み）で書く
    - 正規化: 300 秒と 5000 概算バイト。入室以外の未認証操作は正規化以外で状態を変えない
    - 入室: トークンと入室記録の照合、同一試行の再送・期限・失効、新規 Owner / Guest、満室、E2 の拒否（部屋を消さない）
    - Guest の新規入室では既存ログを消す。同一試行の再送では消さず、通知・Idle_Timer を更新しない
    - Member_ID は入室ごとに割り当てる。N1〜N5 の順序、空文字 say は read として扱う
    - 認証の表（トークンなし / 一致なし / Guest / Owner）と、`close` の E8 の例外
    - 状態が変わらないときは同じ参照を返す
    - E10（認証コードの発行失敗）は返さない。空室に戻すときと席を空けるときに IP・UA も消す
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.7, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 10.1, 10.2, 11.6, 12.2, 12.3, 12.4, 15.3_
  - [x] 1.4 `toRoomView` を書く（新しい順、`mine` を Member_ID で決める、`idleSeconds`、ほかの人の IP・UA・ハッシュを含めない）
    - _Requirements: 7.1, 7.6, 7.8, 15.1_
  - [x] 1.5 `src/features/two-shot-chat/rules.test.ts` に例ベースのテストを書く: research.md §5.2 の N1〜N10 と
        §5.3 の E1〜E9 が出る操作列をすべて。300 秒 / 299 秒、5000 / 5001 バイトの境界
    - _Requirements: 18.3_
  - [x] 1.6 同じファイルに fast-check のプロパティテストを書く: 任意の操作列・時刻・トークンに対して design.md §6 の
        不変条件が成り立つ。時刻は Unix ミリ秒、seats は `[null, null]` で初期化し、拒否した入室・同一試行の再送を含める
    - _Requirements: 18.2_

- [ ] 2. DB と Edge Function を作る（Requirement 12 / 14 / 15、PR3）
  - [ ] 2.1 マイグレーション `two_shot_rooms` / `two_shot_admissions` を書く: 表、RLS（ポリシーなし）、PUBLIC / anon / authenticated の権限の剥奪、service_role の必要権限、
        `01`〜`10` の行、`two_shot_lobby()`（SECURITY DEFINER、`search_path = ''`）、自己検証
    - 自己検証: anon / authenticated が表を読み書きできず、保存 RPC を実行できない。公開関数は 5 列、
      300 秒前は empty・299 秒前は waiting、JSON null の Guest は不在扱い、full のときは名前などが null
    - `two_shot_admissions` のハッシュ一意制約、要求指紋、結果、attempt_at、削除用インデックスを定義する
    - _Requirements: 4.5, 10.4, 14.1, 14.2, 14.3, 14.4, 14.5, 15.1_
  - [ ] 2.2 `supabase/functions/two-shot/handler.ts` を書く: CORS、405 / 400、部屋の ID の検証、`x-two-shot-token` の
        SHA-256、信頼境界を設定した IP resolver と `user-agent`、CAS RPC（最大 3 回、続けば 503）、トレース
    - 入室でもヘッダのトークンを必須とし、形式・時刻・指紋を検証する。未選択の部屋は E1、未知の ID は 400
    - 時刻を CAS の試行ごとに取り直し、同時入室で記録と部屋の読取時点がずれた場合は再読込する
    - 全応答 no-store。64 KiB のボディ上限、UA 上限、本文・トークン等をトレースに載せない
    - _Requirements: 5.8, 5.10, 5.11, 12.1, 12.5, 12.6, 12.7, 14.1, 14.6_
  - [ ] 2.3 `index.ts` と `supabase/config.toml` の `[functions.two-shot] verify_jwt = false`
    - _Requirements: 14.6_
  - [ ] 2.4 応答のフィクスチャ（`fixtures/*.json`: ログ、ページのお知らせ、下ペインのお知らせ、入口へ戻る）を置く
    - _Requirements: 14.6_
  - [ ] 2.5 `handler.test.ts`（Deno）: save-chat と同じくクライアントを差し替えて、上の各項目と「トークンなしの要求で
        正規化以外の変更がない」「応答にほかの人の IP・UA が入らない」を確かめる。保存済み入室の再送・失効・期限・同時送信も含める
    - _Requirements: 12.3, 15.1, 18.3_
  - [ ] 2.6 ローカルの Supabase で `supabase db reset` と Edge の起動を確かめる（`scripts/smoke-save-chat-edge.sh` と同じ手順）
    - _Requirements: 14.5_
  - [ ] 2.7 `two_shot_commit` を作る: service_role 専用、部屋行のロックと version 照合、入室記録の一意性、
        受付期限と正規化境界の再検証、状態・入室記録・監査の同一トランザクション保存
    - DB 例外は全体をロールバックする。version / admission の競合のみ再評価し、通信失敗を自動再送しない
    - _Requirements: 5.10, 5.11, 14.1, 14.2_
  - [ ] 2.8 Q4(b)（採用済み）の `two_shot_audit`、権限、発言の原子的 INSERT、毎時の 30 日超過削除を作る
    - 管理用参照も 30 日未満、最大物理削除遅延 1 時間。記録の主キーは部屋と version、Member_ID で入室者を識別
    - 採否をサーバー側で固定し、クライアントが監査を無効化できないようにする
    - _Requirements: 15.5_
  - [ ] 2.9 入室記録の 24 時間後の削除、pg_cron の導入・ジョブ検証、削除失敗の監視を用意する
    - Q4(b) 不採用でも入室記録の削除は必要
    - _Requirements: 5.11, 15.5_
  - [ ] 2.10 `supabase/tests/two_shot.sql` に実 DB の統合テストを書く
    - CAS 競合、同一トークンの別部屋への同時使用、監査 INSERT 失敗時の状態・version・付随記録の全体ロールバック
    - ロール別権限、時刻と JSON null の境界、保持期限の内外、削除ジョブの設定
    - _Requirements: 14.1, 14.2, 14.5, 15.5, 18.3_
  - [ ] 2.11 `.github/workflows/two-shot.yml` で本機能の Vitest / Deno / ローカル Supabase SQL テストを必須実行する
    - 既存 CI の `continue-on-error` に依存しない。失敗を許容せず、再現手順を PR に記録する
    - _Requirements: 18.2, 18.3, 18.6_

- [ ] 3. フレームとスタイルを作る（Requirement 2 / 17、PR4）
  - [ ] 3.1 `config.ts`（design.md §3。表示用の数値は `rules.ts` から import）と、部屋の ID が `rules.ts` と一致することの
        テスト
    - _Requirements: 3.2, 14.4_
  - [ ] 3.2 `styles/two-shot.css`: `base` レイヤーでの `all: revert`、スコープのフォントと色、リンクの色（`#f55550` /
        `#ff5555`）、小さい文字
    - _Requirements: 17.6, 17.7_
  - [ ] 3.3 `FrameLayout`: grid、5px の Frame_Border（Task 0.3 の結果に合わせる）、各ペインのスクロール、Pointer Events と
        キーボードでの移動、`role="separator"` と `aria-valuenow`、最小 40px
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 17.9_
  - [ ] 3.4 FrameLayout のテスト: 初期の比率、矢印キーで 1% 動く、最小の高さで止まる

- [ ] 4. 画面の部品を作る（Requirement 3 / 4 / 6 / 7 / 11、PR4）
  - [ ] 4.1 `SexLabel` と `utils/noticeText.ts`（N1〜N10、E1〜E12。E2 / E12 の明示した差分を反映し、それ以外は原作と一致させる）
    - _Requirements: 7.3, 11.1_
  - [ ] 4.2 `EntryForm`（research.md §3.1）。入力欄は `size` / `maxLength` の属性で幅と上限を合わせる
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 17.6_
  - [ ] 4.3 `RoomList`（research.md §3.2）: 更新の切り替え、見出し行、状態の色、待機中だけの Owner の情報、取得前の空欄、
        `異常(2)`、`ホームページへ戻る`、著作表示（Q3: 文字のクレジット）、Q4 (a) の注意書き
    - _Requirements: 4.1, 4.2, 4.6, 4.7, 4.8, 4.9_
  - [ ] 4.4 `ChatForm`（research.md §3.3）: Owner / Guest のボタン、自動更新のラジオ、注意書き 2 行
    - _Requirements: 6.1, 6.2_
  - [ ] 4.5 `ChatLog`（research.md §3.4）: 新しい順と `<hr>`、自分の行の色、お知らせの行、フッターの 3 つの表示、
        Owner の `画面クリア`。`utils/formatTime.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.9_
  - [ ] 4.6 `NoticePage`（research.md §3.5）: ページ全体版と下ペイン版
    - _Requirements: 11.1_
  - [ ] 4.7 各部品と、S1〜S11 の組み合わせのストーリーを書き、Task 0.3 のスクリーンショットと並べて比べる。違いを直す
    - _Requirements: 18.1, 18.4_
  - [ ] 4.8 部品のテスト（日本語の名前）: 文言、属性（`size` / `maxLength` / `border`）、状態ごとの出し分け
    - _Requirements: 18.5_

- [ ] 5. API クライアントとストアを作る（Requirement 4 / 8 / 12 / 13 / 17、PR5）
  - [ ] 5.1 `protocol.ts`（要求・応答の型と検証）と、Task 2.4 のフィクスチャを通すテスト
    - _Requirements: 14.6_
  - [ ] 5.2 `api/twoShotApi.ts`: `fetch` で `/functions/v1/two-shot` と `/rest/v1/rpc/two_shot_lobby` を呼ぶ。
        Supabase の SDK を import しない。10 秒タイムアウト、失敗は E12。変更操作を自動再送しない
    - _Requirements: 11.5, 17.5_
  - [ ] 5.3 `api/sessionStore.ts`（pending / active、active の表示用 me、条件付き clear、保存不可時のメモリ退避）と
        `api/roomResource.ts`（初期取得の外部ストア）を作る
    - 送信前に 256 ビット乱数を含むトークンと入室要求を保存。pending の再読み込みでフォームを復元する
    - 古い要求は token / generation で排除。最後の購読解除で abort とログのキャッシュ破棄、再購読は read
    - 初回 read が通信失敗しても active.me で上ペインを描き、E12 から手動更新できる
    - _Requirements: 5.10, 8.5, 8.6, 8.7, 12.5, 17.2_
  - [ ] 5.4 `api/lobbyStore.ts`（`idle` / `loaded` / `error`、最初の購読で取得、`reload()`、世代管理と取得の重複抑止）
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 17.2_
  - [ ] 5.5 `api/entryStore.ts` を既存 `createPersistentStore` の上に作り、入力は `useStoreBackedState` で扱う
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
  - [ ] 5.6 `hooks/useAutoRefresh.ts`（`useEffectEvent`、表示中のログだけ、再表示で更新可能なら 1 回、操作中は tick を捨てる）
    - _Requirements: 4.3, 8.2, 8.3_
  - [ ] 5.7 ストアとフックのテスト（`visibilitychange`、StrictMode、保存不可、古い応答、再購読を含む）

- [ ] 6. 画面をつなぐ（Requirement 3 / 5 / 6 / 8 / 9 / 11 / 17、PR5）
  - [ ] 6.1 `LobbyScreen`: `useActionState` の入室の Action、`入室` / `開設`（`formData.has('make')`）、E1 / E2 のページ全体の
        お知らせ、満室のときに入力を保持して一覧を取り直す、成功したら `roomResource` の初期値と active Session を保存
    - 同じ pending の再送、失効した試行の page E4、通信失敗の page E12、入力変更時の新しい試行を扱う
    - _Requirements: 3.5, 3.6, 5.3, 11.2, 13.1, 13.2, 17.1_
  - [ ] 6.2 `RoomRestoreBoundary` で初期取得ストアを購読し、完了後に `RoomScreen` を mount する。
        `useActionState` の非同期 reducer、previous の直前ログ、terminal の失効状態、`直前の画面`、`空室状況へ`
    - Action の入口で重複 dispatch を抑止し、自動更新をためない。通信失敗・abort の後でも操作可能に戻す
    - _Requirements: 8.1, 9.6, 11.2, 11.3, 11.4, 17.1, 17.3_
  - [ ] 6.3 ChatForm の操作: `onSubmit` で `startTransition(dispatch)` し文字を残して全選択、`いつでも手動更新` とラジオで
        発言欄を空にして取得、`confirm()`、相手を退室で自動更新を なし に、入室直後のフォーカス
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7_
  - [ ] 6.4 `TwoShotPage`: `sessionStore` で LobbyScreen / RoomRestoreBoundary を出し分け、初期取得中は空のフレーム。
        `useSEO` に Session に応じたタイトルを一か所から渡し、Lobby に戻ると復元する。`usePageView` に私的な入力値を渡さない
    - LobbyScreen と RoomScreen がそれぞれ FrameLayout を持つので、切り替えで比率が既定に戻る
    - _Requirements: 2.7, 8.5, 17.2_
  - [ ] 6.5 画面のテスト（design.md「コンポーネントのテスト」「レビューで追加した受け入れケース」の各項目）
    - _Requirements: 18.5_
  - [ ] 6.6 `pnpm lint`（型情報を使う lint）と Compiler_Check が、本機能のファイルを許可リストなしで通すことを確かめる
    - _Requirements: 17.4, 17.8_

- [ ] 7. 発言の文字参照を展開する（Requirement 7.10、PR6、任意）
  - [ ] 7.1 `utils/decodeCharRefs.ts`: 数値の文字参照と、よく使われた名前付きの文字参照の表。`innerHTML` を使わない
    - _Requirements: 7.10_
  - [ ] 7.2 テスト: `&hearts;` `&#9829;` `&#x2665;` が ♥ に、`&lt;b&gt;` が `<b>` の文字になる。未知の参照はそのまま

- [ ] 8. `/chat/2shot/` を切り替える（Requirement 1 / 15 / 16、PR7）
  - [ ] 8.1 `routing.ts`（`matchTwoShotRoute`）、`resolveRoute.ts`、`routeLoaders.ts`、`App.tsx`（lazy とシェルの色）、
        `src/routes/TwoShotRoute.tsx`。`/chanari/2shot/` から `/chat/2shot/`（`buildChatRoomPath`）へのリダイレクト
    - `rooms.ts` の `'2shot'` の ID・カテゴリ・関連部屋はそのまま残す。`chats` の `room_id = '2shot'` の行には触れない
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 1.8, 16.2_
  - [ ] 8.2 `prerenderHtml.ts` に `renderTwoShotHtml` を足し、`prerender-rooms.ts` の通常の部屋とちゃなりのループから
        `'2shot'` を外す。SEO の head を `useSEO` と同じ値にする（canonical・og:url は `/chat/2shot/`）
    - 出力先は `buildOutputRelativePath('2shot')`。SSG は描画エラーを出さない（`renderToHtml` がビルドを止める）
    - _Requirements: 1.5, 1.6, 1.9_
  - [ ] 8.3 `rooms.ts` の `'2shot'` の紹介文を書き換える（Q4 の決定を反映）
    - _Requirements: 15.4, 15.5_
  - [ ] 8.4 トップの参加人数: 既存の人数 RPC は変更せず、`two_shot_lobby()` を並行取得して合流する
    - RPC 結果変換・404 時の行取得 URL・行集計の全経路から公開 `2shot` を除外する
    - 一方の取得に失敗しても他方の人数を保持する。切り替え PR の revert で旧集計に戻る
    - _Requirements: 15.2, 16.1_
  - [ ] 8.5 ルーティングとプリレンダのテスト: `/chat/2shot/` と `/chat/2shot` が two-shot、`/chanari/2shot/` と
        `/chanari/2shot` が `/chat/2shot/` へリダイレクト（BASE_URL 込み）、似た別パスが一致しないこと
    - build 後の静的依存に `vendor-supabase` だけでなく分割済みの Supabase SDK もないこと
    - 人数 RPC の成功 / 404 フォールバック / 部分失敗 / 全失敗を検証する
    - _Requirements: 1.1, 1.3, 1.5, 1.9, 17.5_
  - [ ] 8.6 ローカルの Supabase とステージングの Edge で、異なる IP または UA の 2 クライアントで状態遷移を確かめ、同じ IP / UA は E2 の拒否用に別途確認する
    - _Requirements: 5.6, 5.8, 18.1_

- [ ] 9. ドキュメントと検収（Requirement 16.3 / 18、PR8）
  - [ ] 9.1 CLAUDE.md に `two-shot-chat/`、Edge Function `two-shot`、`two_shot_rooms`（ログを公開しない、service_role
        だけが書く）、入室記録・監査・保存 RPC・削除ジョブを書く
    - _Requirements: 16.3_
  - [ ] 9.2 S1〜S11 の Oracle との比較の結果を PR に記録する
    - _Requirements: 18.1_
  - [ ] 9.3 requirements.md の Success Metrics を計測して記録する（チャンクの大きさ、modulePreload、API の p95）
    - _Requirements: 17.5, 18.1_
