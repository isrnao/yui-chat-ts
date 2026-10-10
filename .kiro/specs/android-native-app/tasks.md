# Implementation Plan: android-native-app

## 進め方

Web とサーバーの前提（Phase 0）→ アプリの基盤（Phase 1）→ 通常チャットの初版（Phase 2）→ 拡張（Phase 3）→
公開（Phase 4）→ 後続（Phase 5）の順に進める。Phase 0 はアプリのコードを含まず、Web にも効く。

2 か所で進むかを決め直す。

- **Gate 1（Phase 0 の後）**: Phase 0 が終わり、`docs/GROWTH_STRATEGY.md` の指標（WRC、会話の成立率、再訪）と
  運営の体制を見て、アプリに人と時間を使うかを決める。見送るなら Phase 0 の成果（安全基盤、サーバーの規則）だけを
  Web で使う
- **Gate 2（Phase 4 のクローズドテストの後）**: 通報の対応の手順が回り、Play のポリシーの申告が済み、クラッシュ率が
  閾値の内なら本番に出す

## 状況（2026-10-11）

- **Phase 0 のサーバーの規則は済んだ。** 旧 Task 0.3（Realtime の `ip`）・0.5（`docs/SERVER_SIDE_LOGIC_REFACTORING.md`
  の P1〜P8）・0.6 の大半（D2〜D5）は PR #203（Issue #175〜#188）で終わった。Q4 は決定済み
- 本番への配信（閉塞中の一括配信、`docs/save-chat-edge-function.md` §9）と §8 の性能の確かめは、アプリと独立に進める
- 残る Phase 0 は、**安全基盤（規約・通報）と Contracts と配信の設定**、それに 2 つの判断（Q13 = D1、退室の偽装）
- spec の後に Web へ入ったフィルタ（`chat-ip-mute`）をブロックとして取り込む（Q12。Phase 2 の Task 2.7）

## PR の順序

| PR   | Task          | 要件                        | 種別                | 規模 | 備考                                                              |
| ---- | ------------- | --------------------------- | ------------------- | ---- | ----------------------------------------------------------------- |
| PR1  | —             | —                           | spec                | 小   | 本 spec。Q1〜Q13 を決める（2026-10-11 に PR #203 の後へ改訂）     |
| 済   | 旧 0.3・0.5   | R21.1〜R21.3 / R21.6        | サーバー + DB + Web | 大   | PR #189〜#203（Issue #175〜#188）                                 |
| —    | Task 0.1〜0.2 | R12 / R13 / R23             | 確認（PR なし）     | 小   | Play の原文、法令（ツーショットとチャット全体）                   |
| —    | Task 0.3      | R21.8                       | 判断                | —    | Q13（D1）と退室の偽装                                             |
| PR2  | Task 0.4      | R12.5 / R18.1               | Web                 | 小   | `/terms/`・`/privacy/`・`/safety/`。文面は運営                    |
| PR3  | Task 0.5      | R21.8                       | DB + Web            | 小   | Task 0.3 で案 A なら RLS とランキングのビュー                     |
| PR4  | Task 0.6      | R12.2〜R12.4 / R21.4        | サーバー + DB + Web | 中   | 通報の表と Edge Function、Web の通報の導線                        |
| PR5  | Task 0.7      | R2.5 / R20.2 / R21.5        | Web                 | 中   | `contracts/`（`schema.ts`・`messages.ts`・`rooms.ts` から生成）   |
| PR6  | Task 0.8      | R21.7                       | サーバー            | 小   | `save-chat` が `x-client` を記録する                              |
| PR7  | Task 0.9      | R16.2                       | Web（配信）         | 小   | `.nojekyll`、`--dotfiles`（ハッシュは Phase 4 で入れる）          |
| —    | Gate 1        | —                           | 判断                | —    |                                                                   |
| PR8  | Task 1.1      | R1 / R20.4                  | Android 基盤        | 中   | `android/` の雛形、convention plugin、CI                          |
| PR9  | Task 1.2      | R2.5 / R20.2                | Android 基盤        | 中   | model / common / contracts の生成と fixtures のテスト             |
| PR10 | Task 1.3      | R14                         | Android 見た目      | 大   | Retro_Design_System。Web_Oracle と見比べる                        |
| PR11 | Task 1.4      | R2 / R8 / R21               | Android 基盤        | 中   | network（design.md §7 の契約。ChatApi / RealtimeHub / SafetyApi） |
| PR12 | Task 1.5〜1.6 | R5 / R6 / R8 / R12.4 / R18  | Android 状態        | 大   | RoomLogRepository、ChatSender、ChatSession、DataStore             |
| PR13 | Task 2.1〜2.2 | R1 / R3 / R12.1 / R13 / R15 | Android 画面        | 中   | アプリの骨組み（Navigation 3、Scene）、同意、ホーム               |
| PR14 | Task 2.3〜2.5 | R4〜R8                      | Android 画面        | 大   | 部屋の画面（入室・発言・ログ・分割・音）                          |
| PR15 | Task 2.6〜2.8 | R9 / R12 / R18              | Android 画面        | 中   | ランキング、通報・フィルタ、設定、戻る                            |
| PR16 | Task 3.1〜3.2 | R10 / R11                   | Android 画面        | 中   | 全部屋まとめ、ちゃなり                                            |
| PR17 | Task 3.3〜3.7 | R15〜R17 / R19              | Android 品質        | 中   | 大画面、App Links、計測・監視、性能、アクセシビリティ             |
| —    | Task 4.x      | R24                         | 公開（PR は少し）   | —    | Play Console、ストア掲載、テスト、Gate 2                          |

## Tasks

- [ ] 0. Web とサーバーの前提をそろえる（Phase 0）
  - [x] 済: サーバーの規則（旧 Task 0.3・0.5・0.6 の D2〜D5）
    - Realtime の INSERT に `ip` は届かない（#186 / #190。CI で毎回確かめる）
    - 入力の検証・metadata の許可リスト・予約名・`system`（#176・#177・#182）、`rooms` 表と外部キー（#178）
    - `op: enter / exit`、おみくじの `extra`、`event` / `subject`（#180・#181・#183）
    - `insert_chat`（送信操作の ID で冪等）・`chat_authors`・`clear_my_chats`、anon の UPDATE を閉じる（#179）
    - look / unlook を INSERT から（#184）、クライアントの人数の集計と mock を削除（#187・#188）
    - _Requirements: 21.1, 21.2, 21.3, 21.6_
  - [ ] 0.1 Play Console と公式ドキュメントの原文で、research.md §4.1・§4.2 を確かめ直す
    - 匿名チャットの Age-Restricted Content and Functionality、Child Safety Standards の自己申告の項目、UGC、
      targetSdk、クローズドテストの人数と日数
    - 違っていたら research.md と requirements.md を直す
    - _Requirements: 12, 13, 24_
  - [ ] 0.2 法令と運用の確認を運営が行い、結果を research.md に足す
    - ツーショットチャット（性別・待機用プロフィール・1 対 1）とインターネット異性紹介事業の規制。Web でも
      電気通信事業法の確認のために止めている（`TWO_SHOT_CHAT_ENABLED = false`）ので、その結論をそのまま使う
    - 電気通信事業の届出の要否（チャット全体）、利用者情報の外部送信の公表（GA4・New Relic・Firebase）
    - 通報の対応の手順（誰が・いつまでに・どこへ）と、児童の安全の担当窓口
    - _Requirements: 12.6, 13.4, 23_
  - [ ] 0.3 残りのサーバーの判断をする（PR なし）
    - Q13（D1）: 削除済みの発言を API から隠すか。Issue #185 は実装なしで閉じたので、決めて Issue を開き直す
    - 退室の偽装: `op: exit` を Author_Key で入室者に限るか（design.md §7.5）
    - 制約の `VALIDATE` の時期（本番の既存行の違反を数えてから）
    - _Requirements: 21.8_
  - [ ] 0.4 `/terms/`・`/privacy/`・`/safety/` を Web に足し、トップのフッターからリンクする（PR2）
    - `/safety/` に CSAE を禁じる基準、通報の方法、対応の流れ、相談先を書く（文面は運営）
    - [消す] の説明（この端末で書いた発言だけ・Q13 の結論）を利用規約と画面で合わせる
    - sitemap とプリレンダの対象に入れる
    - _Requirements: 12.5, 18.1_
  - [ ] 0.5 Q13 が案 A なら、削除済みの発言を隠す（PR3）
    - `public-select` を `USING (deleted = false)`、`chat_ranking` を所有者の権限のビューに。pgTAP
    - 全部屋まとめの見え方が変わることを Web の画面とテストに反映する
    - _Requirements: 21.8_
  - [ ] 0.6 通報を受ける（PR4）
    - マイグレーション `chat_reports`、Edge Function `report-chat`（検証は依存の無い `schema.ts`、1 時間 10 件の制限、
      `snapshot`、鍵のハッシュは `author_key_hash()`）。Deno のテストと pgTAP、`save-chat.yml` と同じ CI
    - 児童の安全に関わる通報を New Relic → PagerDuty で知らせる
    - Web のログに通報の導線を足す（発言から 2 操作以内。ダブルタップのフィルタと取り合わない操作にする）
    - テストの通報を運営が受けて記録を残せることを確かめる
    - _Requirements: 12.2, 12.3, 12.4, 21.4_
  - [ ] 0.7 `contracts/` を作る（PR5）
    - `scripts/export-contracts.ts` で `rooms.json`（`appScope` 付き）、`directory.json`、`theme.json`、
      `chat-options.json`（`schema.ts` の上限・選択肢、`INPUT_ERROR_MESSAGES`）、`server-messages.json`（`messages.ts`）、
      `legal.json` を生成する。`rooms.ts` に `appScope` を足す
    - `fixtures/`（chat-rows / room-log-events / optimistic / filters / author-key / save-chat）を Web と Deno の
      テストの場面から作る。`save-chat` は Deno の `handler.test.ts` でも同じ fixtures を読む
    - `src/test/contracts.test.ts` で、生成し直した結果が同じことと、fixtures が Web の関数で期待値になることを確かめる
    - CLAUDE.md に「`contracts/` は生成物。`schema.ts`・`messages.ts`・部屋・型を変えたら生成し直す」と書く
    - _Requirements: 2.5, 20.2, 21.5_
  - [ ] 0.8 `save-chat` が `x-client` を記録する（PR6）
    - スパンの属性 `client.app`。無ければ `web` とみなす。Deno のテスト
    - _Requirements: 21.7_
  - [ ] 0.9 `/.well-known/` を公開できるようにする（PR7）
    - `public/.nojekyll` を置き、`deploy` を `gh-pages -d dist --dotfiles` にする
    - 仮の `assetlinks.json` を置き、公開後に `curl` で取れることを確かめる
    - _Requirements: 16.2_

- [ ] Gate 1: Phase 0 の結果と成長戦略の指標を見て、Phase 1 に進むかを決める

- [ ] 1. アプリの基盤を作る（Phase 1）
  - [ ] 1.1 `android/` の雛形を作る（PR8）
    - `libs.versions.toml`、`build-logic/convention`、`app` と空の `core` / `feature` のモジュール
    - targetSdk 36、minSdk（Q11）、applicationId（Q10）、日本語だけの `localeConfig`、R8
    - `.github/workflows/android.yml`（path フィルタ、JDK 21、Gradle のキャッシュ、Spotless / detekt / Lint /
      単体テスト / ビルド）。`.prettierignore` に `android/` を足す
    - CLAUDE.md に Android の節（コマンド、モジュール、Contracts）を足す
    - _Requirements: 1.1, 1.2, 1.6, 20.4_
  - [ ] 1.2 `core:model`・`core:common`・`core:contracts` を作る（PR9）
    - Gradle のタスクで `contracts/*.json` から Kotlin を生成する
    - 日時の表記、URL の分割、管理人の分割表示、参加者（`event` / `subject`）、フィルタの一致を写し、fixtures で
      テストする。入力の検証・運勢・入退室の文言の組み立ては写さない（サーバーが正。画面の上限は Contracts の値）
    - _Requirements: 2.5, 6.2, 6.3, 20.2_
  - [ ] 1.3 Retro_Design_System を作る（PR10）
    - トークン（`theme.json` から生成）、DotGothic16 の同梱と大きさの計測、`RetroButton` / `RetroTextField` /
      `RetroSelect` / `RetroCheckbox` / `RetroRadio` / `RetroLink` / `RetroDivider` / `RetroSplitter` /
      `LegacyAvatar`、ちゃなりのテーマ
    - 各部品の `@Preview` と Roborazzi。文字の大きさ 100% / 200%、Compact / Expanded
    - Web_Oracle（Storybook の `Button` / `Input` / `Divider` / `RetroSplitter`）と並べて見比べ、結果を記録する
    - _Requirements: 14.1〜14.7, 7.2, 7.3_
  - [ ] 1.4 `core:network` を作る（PR11）
    - design.md §7 の契約どおりに: `ChatApi`（取得・全部屋・ランキング・人数・`save-chat` の `op`・`extra`・
      `clear_my_chats` の uuid 配列）、`RealtimeHub`（`chats-postgres-<room>` / `-all`）、`SafetyApi`
    - 再試行（5xx と通信の失敗だけ 1 秒 → 2 秒、最大 3 回、全試行で同じ操作 ID）、400 のコードを型で返す、
      User-Agent、`x-client`、`x-chat-author-key`
    - `fixtures/save-chat/` と `fixtures/author-key/` の契約テスト。ローカルの Supabase に対する相互の確認のテスト
      （design.md §11.4、専用の CI）
    - _Requirements: 2.1〜2.4, 5.3, 8.6, 20.3, 21_
  - [ ] 1.5 `core:data` を作る（PR12）
    - `RoomLogReducer`（Web の Room_Log_Store の規則をすべて）と `RoomLogRepository`、`RoomLogRepositoryRegistry`
    - `OptimisticLog` と `ChatSender`（アプリの寿命の CoroutineScope。応答の行で確定）、`ChatSession`（§6.4 の表）
    - `FilterStore` を通したログの切り出し（フィルタを除いてから `take(windowRows)`）
    - `RoomCountsRepository`、`RankingRepository`
    - fixtures のテスト、kotest-property の性質のテスト、Turbine で `WhileSubscribed(5_000)` の開始と停止
    - _Requirements: 5.2〜5.5, 6.1, 6.2, 8.1〜8.3, 8.6, 12.4_
  - [ ] 1.6 `core:datastore` を作る（PR12）
    - settings / consent / drafts / filters / authorKey。バックアップと端末間の移行から外す
    - Author_Key は 32 バイトの乱数の base64url（43 文字）。形が違えば作り直す
    - 訪問回数（起動時と、裏に 30 分以上いてから戻ったとき）
    - _Requirements: 4.5, 11.4, 12.4, 18.3, 18.4_

- [ ] 2. 通常チャットの初版を作る（Phase 2）
  - [ ] 2.1 アプリの骨組みを作る（PR13）
    - `MainActivity`（`enableEdgeToEdge`）、`NavDisplay`、entry ごとの ViewModel、Scene（ボトムシート・リスト・詳細）
    - App_Room_Scope の外の部屋を開こうとしたらホーム
    - 同意の画面（18 歳以上の確認、規約の版）
    - _Requirements: 1.3〜1.5, 12.1, 13.2, 15.1〜15.3_
  - [ ] 2.2 ホームを作る（PR13）
    - ヘッダー、タブ、部屋一覧（`directory.json` を App_Room_Scope で絞る）、人数、ピックアップ、使い方、ルール、
      フッター、X へのリンク
    - Expanded で部屋を選んでいないときの右側（中央・右カラムの内容）
    - Web_Oracle のトップ（412px / 1280px）と見比べる
    - _Requirements: 3.1〜3.6, 13.2_
  - [ ] 2.3 入室フォームを作る（PR14）
    - 項目・文言・検証・[リセット]・カラーナビのダイアログ・アバター・部屋の紹介
    - 入室で保存を待たずに切り替え（`op: "enter"`）、失敗したら戻してエラー（400 のコードの文言は Web と同じ）
    - _Requirements: 4.1〜4.7_
  - [ ] 2.4 発言フォームとコマンドを作る（PR14）
    - [退室] [ランキング]、[更新] [発言] [消す]、発言欄（`ImeAction.Send`、送信で空にする、フォーカスの戻し方）、
      ログ行数・Size・色・細字
    - `LookSoundPlayer`（マナーモードと設定に従う）。ほかの人の look / unlook は Realtime の INSERT で鳴らす
    - 連絡先の警告（P1。間に合わなければ Phase 3）
    - _Requirements: 5.1〜5.7, 8.4, 12.7_
  - [ ] 2.5 ログと分割を作る（PR14）
    - `ChatLog`（key、先頭に留まる、状態の表示、つながっていない表示）、`ChatMessageRow`（管理人、きらめき、リンク、
      時刻）、`ParticipantsHeader`（分の境界）、ダブルタップ（押した場所でフィルタの種類）、長押しのメニュー、本文の選択
    - `RetroSplitter` のキーボードの扱い（上のペインを保つ）
    - Web_Oracle と見比べる: 入室前、入室後、管理人の発言、look、おみくじ、読み込み失敗、1000 行
    - _Requirements: 6.1〜6.8, 7.1〜7.5, 8.5_
  - [ ] 2.6 ランキングを作る（PR15）
    - ログの `LazyListState` を残して切り替え、開閉だけフェード
    - _Requirements: 9.1, 9.2_
  - [ ] 2.7 通報・フィルタ・設定を作る（PR15）
    - 通報のボトムシート（理由、説明 500 文字、受け付けの表示、児童の安全のときの相談先）
    - フィルタ（Q12。Web の `chat-ip-mute` と同じ確認の窓・言葉の選び方・振動・一覧・解除。名前のフィルタは参加者からも
      外す）。発言フォームの「フィルタ(N)」。Web_Oracle（`FilterConfirmDialog` / `FilterListDialog` のストーリー）と見比べる
    - 設定の各項目、端末のデータを消す、ライセンス
    - _Requirements: 12.2〜12.4, 17.3, 18.4_
  - [ ] 2.8 戻る操作とライフサイクルを仕上げる（PR15）
    - 入室中に部屋の entry が外れたら退室の発言（`onCleared`、アプリの寿命の CoroutineScope）
    - 裏に回って 5 秒で Realtime を閉じ、戻ったら取り直す。回転・サイズ変更で状態を失わない
    - _Requirements: 1.4, 1.5, 8.2, 8.3_

- [ ] 3. 拡張と品質（Phase 3）
  - [ ] 3.1 全部屋まとめを作る（PR16）
    - App_Room_Scope での絞り込み（取得と Realtime）、返信先、`all` への入退室
    - _Requirements: 10.1〜10.4_
  - [ ] 3.2 ちゃなりを作る（PR16）
    - `ChanariTheme` で各部品、リロード秒（切れている間だけ）、エフェクト等の選択（反映しない）、文字数、下書き
    - Web_Oracle（ちゃなりのストーリー）と見比べる
    - _Requirements: 11.1〜11.4_
  - [ ] 3.3 大きな画面を仕上げる（PR17）
    - 折りたたみの開閉、デスクトップのウィンドウ、物理キーボード（Enter、矢印キー）
    - Android 17（API 37）を対象にしたビルドで向き・サイズの制限が無視されても崩れないことを確かめる
    - _Requirements: 15.1〜15.5_
  - [ ] 3.4 App Links と共有を作る（PR17）
    - `/chat/<id>/`・`/chanari/<id>/` の intent filter（autoVerify）、共有シート
    - _Requirements: 16.1, 16.3_
  - [ ] 3.5 計測と監視を入れる（PR17）
    - GA4 の Android のストリーム、`AnalyticsEvent`、New Relic Android agent、`traceparent` のつながりの確認
    - _Requirements: 17.1〜17.3_
  - [ ] 3.6 性能を測って仕上げる（PR17）
    - Baseline Profile の生成、Macrobenchmark（起動・ホーム・部屋・1000 行）、遅延初期化、ダウンロードの大きさ
    - _Requirements: 19.1〜19.4_
  - [ ] 3.7 アクセシビリティを確かめる（PR17）
    - TalkBack で入室から発言・通報まで、文字の大きさ 200%、押せる範囲、コントラスト（Web と同時に直すものを洗い出す）
    - _Requirements: 14.4, 14.5, 7.3_

- [ ] 4. 公開する（Phase 4）
  - [ ] 4.1 Play Console を用意する
    - アプリの作成、Play App Signing、アップロード鍵、`android-release.yml`
    - 署名鍵の SHA-256 を `assetlinks.json` に入れて公開する（PR）
    - _Requirements: 16.2, 24.1_
  - [ ] 4.2 ポリシーの申告とストア掲載をそろえる
    - 対象年齢 18 歳以上だけ + Restrict Minor Access、コンテンツのレーティング（利用者どうしの交流あり）、
      データセーフティ、Child Safety Standards の自己申告と担当窓口、プライバシーポリシーの URL
    - ストア掲載の文言と画像（18 歳以上向け、匿名、通報と非表示（フィルタ）。未成年を集める表現を使わない）
    - _Requirements: 12.6, 13.1, 18.2, 24.4_
  - [ ] 4.3 内部テストとクローズドテストを行う
    - 内部テストで一通り確かめた後、12 人以上・14 日間のクローズドテスト
    - Web とアプリで同じ部屋に入る手動の確認（design.md §11.4）、テストの通報の対応
    - _Requirements: 20.3, 24.2_
  - [ ] Gate 2: 通報の対応の手順、ポリシーの申告、クラッシュ率・ANR 率を見て本番に出すかを決める
  - [ ] 4.4 本番に段階的に出す（10% → 50% → 100%）。In-App Updates を有効にする
    - _Requirements: 24.3_

- [ ] 5. 後続（Phase 5、それぞれ別の spec か追記で決める）
  - [ ] 5.1 イベントの通知（成長戦略 §7 の条件がそろってから。FCM、許可の求め方、種類ごとの設定）
    - _Requirements: 22_
  - [ ] 5.2 ツーショットチャット（Task 0.2 の結果しだい。`two-shot` の API、会話を端末に保存しない）
    - _Requirements: 23_
  - [ ] 5.3 `material3` 1.5.0 が stable になったら、システムの面に Material 3 Expressive を取り込む
  - [ ] 5.4 targetSdk 37 に上げる（Task 3.3 の確認の後）
  - [ ] 5.5 直近のログのキャッシュ（すぐ開きたい要望があれば）、Kotlin Multiplatform と iOS の検討
