# Research: android-native-app

調査日: 2026-09-28。対象はリポジトリの `main`（`14af9c4`）と、2026-09 時点の Android / Google Play の公開情報。
本書で「§N」と書いたものは本書の節を指す。

**2026-10-11 追記**: `main`（`0ee4a0f`、PR #203 のマージ後）で §2.2・§2.6〜§2.8 を確かめ直し、§2.9 を足した。
§4 の Android / Play の情報は 2026-09 のまま（Task 0.1 で原文に当たる）。

## 1. 目的と前提

お気楽チャットTS（`https://www.okiraku.chat/`）の Android ネイティブアプリを作るための調査。要件は
[requirements.md](./requirements.md)、設計は [design.md](./design.md)、作業の順序は [tasks.md](./tasks.md) にまとめた。

本 spec では、依頼にある 2 つの言葉を次の意味で使う。

- **Web 版の UX/UI に忠実**: 見た目（レトロな配色・書体・罫線・文言・並び）、操作（入室 → 発言 → 退室、コマンド、
  ログ行数、ランキング）、データ（同じ Supabase・同じ部屋・同じログ）を Web 版と同じにする。アプリの利用者と Web の
  利用者は**同じ部屋で会話する**。アプリを別のサービスにはしない
- **2026 年の Android の設計思想**: Android Developers の公式ガイド（UI 層 / データ層、単方向データフロー、Compose、
  Navigation 3、アダプティブ）と、2026 年時点のプラットフォームと Google Play の要件（§4）に従う

つまり「見た目と振る舞いは Web 版、骨格は 2026 年の Android」にする。両者がぶつかるところ（年齢制限、戻る操作、
大画面、文字の大きさ）は requirements.md の「決めること」で扱う。

## 2. Web 版の棚卸し（アプリで再現する対象）

### 2.1 画面

| URL              | 画面                 | 主な部品                                                                            | アプリでの扱い                          |
| ---------------- | -------------------- | ----------------------------------------------------------------------------------- | --------------------------------------- |
| `/`              | トップ（部屋一覧）   | `Header`、`LeftColumn`（カテゴリ別の部屋と人数）、`MainColumn`、`RightColumn`       | ホーム。X の埋め込みと広告は除く        |
| `/chat/<id>/`    | 通常チャット         | `RetroSplitter`、`EntryForm` / `ChatRoom`、`ChatLogList`、`ChatRanking`、`RoomInfo` | 中心の画面。最初に作る                  |
| `/chat/all/`     | 全部屋まとめ         | 上と同じ部品 + 返信先（`useReplyTarget`）                                           | 2 番目に作る                            |
| `/chanari/<id>/` | なりきり（ちゃなり） | `ChanariTopHeader`、`ChanariEntryForm`、`ChanariChatRoom`、専用 CSS                 | 2 番目に作る                            |
| `/chat/2shot/`   | ツーショットチャット | `FrameLayout`、`LobbyScreen`、`RoomScreen`、Edge Function `two-shot`                | 初版には入れない（§4.2、決めること Q3） |
| その他           | 404                  | `NotFoundPage`                                                                      | 不明なリンクはホームへ                  |

### 2.2 通常チャットの振る舞い（アプリで同じにするもの）

コードを読んで確かめた振る舞い。アプリの受け入れはこれと同じになることを確かめる。

- **入室フォーム**（`EntryForm`）: おなまえ（必須・24 文字、ピンク背景 `#feb6c1` の行）、[チャットに参加する]・
  [リセット]、名前の色（テキスト 12 文字 + 「カラーナビ」でカラーピッカー）、こっそり、E-Mail/URL（任意・64 文字）、
  アバター 14 種（なし + GIF 13 個）のラジオ。入室に成功したときだけ設定を保存する
- **入室**（`useChatSession.enter`）: 名前を検証してすぐチャット画面へ切り替え、こっそりでなければ `save-chat` に
  `op: "enter"`（名前・色・訪問回数・前回ログイン・nonce）を送る。管理人の「`{name} さん、Welcome to お気楽チャット☆`」は
  サーバーが作り、画面は同じ文言（`messages.ts`）で楽観的に出す。入室するとログの取得件数を 10 件から 100 件へ広げる
- **退室**: `op: "exit"` を送り（「`{name}さん、またきておくれやすぅ。`」はサーバーが作る）、入力欄を空にして
  入室フォームへ戻る
- **発言フォーム**（`ChatRoom`）: [退室] [ランキング] のリンク、[更新] [発言] [消す]、「おなまえ:」の表示、
  発言欄（120 文字）、ログ行数（30 / 50 / 40 / 20 / 10 / 100。管理者チャットと全部屋まとめは 200 / 500 / 1000 も）、
  Size（1〜5）、色（15 色）、細字。送信するとすぐ発言欄を空にし、完了後に発言欄へフォーカスを戻す
- **コマンド**: `cut`（何もしない）、`clear`（`clear_my_chats` でこの端末が書いた自分の名前の発言を論理削除）、
  `look` / `unlook`（通知音を鳴らす / 止める。受け手は保存された発言の Realtime の INSERT で鳴らす）、`おみくじ`
  （サーバーが巫女の返事を同じ要求で保存し、応答の `extra` で返す）
- **ログ**（`ChatLogList` / `ChatMessage`）: **新しい発言が上**。先頭に「`[HH:MM] 参加者(n): 名前…`」と固定の
  リンク文言、発言ごとに区切り線。発言は「アバター 名前 `>` 本文 (日時 マスク済み IP)」。メールがあれば `>` が
  リンクになる。本文の URL はリンクにする。`look` の発言には `rin.gif` のきらめき。保存中は時刻の代わりに「送信中...」
- **管理人の発言**: 「管理人 `|>` **名前**(1.3em、入室者の色) さん、…」。入室の発言は「プロフィールも作ってみてね」を
  足し、2 行目に UA・訪問回数・LAST LOGIN を出す。「Issue #N」は自リポジトリの Issue へのリンクにする
- **参加者**（`getRecentParticipants`）: 直近 5 分の発言者と入室の発言から数え、退室の発言で除く。1 分ごとに再計算する
- **ランキング**: 開くとログの代わりに全期間の発言数ランキング（`chat_ranking` ビュー）を出す。ログは消さずに残し、
  戻るとスクロール位置も戻る
- **分割**（`RetroSplitter`）: 上が入力、下がログ。境界はドラッグと矢印キーで動く。初期の高さは入室前 26%（PC 24%）、
  入室後 18%、最小 100px
- **接続**: Realtime の `postgres_changes`（INSERT）で新着を受け、`connected` に戻るたびに取り直す。取得の失敗は
  「チャットログの読み込みに失敗しました。[再読み込み]」。オフラインでも見本のログ（mock）は出さない（#188）
- **フィルタ**（`chat-ip-mute`）: 行のダブルタップで、押した場所に応じて IP（伏せ字）・名前・言葉のフィルタを確認の
  窓で足す。発言フォームの「フィルタ(N)」で一覧と解除。閲覧者のブラウザの中だけの設定（§2.9）

### 2.3 ちゃなり（`/chanari/<id>/`）

通常チャットと同じデータ・同じ Session に、別の見た目を被せたもの。名前色・発言色（テキスト + パレット）、リロード秒
（2〜120 秒。Realtime が切れている間だけ取り直す）、エフェクト・文字サイズ・AT フィールドの選択（**選べるだけで発言には
反映しない**。Web と同じにする）、文字数カウンタ（120 字）、部屋ごとの下書きの保存と復元。

### 2.4 全部屋まとめ（`/chat/all/`）

全部屋の新着を 1 本の Realtime で受けて 200 件から表示する。発言は「返信先」の部屋に保存し、発言の部屋名を押すと
返信先が変わる。入退室の管理人の発言は `all` に出す。`clear` は返信先の部屋の自分の発言だけを消す。

### 2.5 トップ（`/`）

`data.ts` の `chatDirectoryGroups`（カテゴリ・色・部屋）に、`room_participant_counts` RPC の人数（直近 6 時間の
発言者数）を添えて出す。ピックアップ、使い方とルール、X のタイムライン、紹介リンク、広告（`AdringWidget`）がある。

### 2.6 アプリが使うバックエンドの契約

| 用途             | 経路                                                                                             | 認可         | 備考                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| ログの取得       | PostgREST `GET chats`（`room_id`、`deleted=false`、`uuid` 降順、件数）                           | anon         | 生の `ip` は列の権限で読めず `ip_masked` を使う。全部屋まとめは `deleted` の条件を付けない                                 |
| 発言・入退室     | Edge Function `save-chat`（`op: say / enter / exit`）                                            | anon         | `ip` / `ua` / `system` はサーバーが決める。`x-chat-operation-id`（冪等）/ `x-chat-attempt` / `x-chat-author-key`           |
| 自分の発言の消去 | RPC `clear_my_chats(p_room_id, p_name, p_author_key)` → 消した uuid の配列                       | anon         | 書いた端末の鍵・部屋・名前で照合。anon の UPDATE は閉じた                                                                  |
| 部屋の一覧       | PostgREST `rooms`（`id`・`category`・`triage`）                                                  | anon         | 外部キーの先。題名・紹介文はクライアント（`rooms.ts`）に残る                                                               |
| ランキング       | PostgREST `chat_ranking` ビュー                                                                  | anon         |                                                                                                                            |
| 部屋ごとの人数   | RPC `room_participant_counts`                                                                    | anon         | クライアントの集計の経路は #187 で消えた                                                                                   |
| 新着・look       | Realtime `postgres_changes` INSERT（`chats-postgres-<id>`、全部屋まとめは `chats-postgres-all`） | anon         | 部屋ごとに 1 channel。look / unlook もこの INSERT の本文で鳴らす（broadcast は無い）。ペイロードに `ip` は届かない（#190） |
| ツーショット     | Edge Function `two-shot`、RPC `two_shot_lobby`                                                   | 独自トークン | 初版では使わない。Web でも今は止めている                                                                                   |

anon key は Web の bundle に入っている公開値なので、アプリに入れても新しく漏れるものはない。

### 2.7 クライアントが持っている規則（アプリで二重に書くことになるもの）

初版の調査（2026-09-28）では、次の規則をクライアントが持っていた。PR #203 の後は「正」の列のとおりで、
**サーバーが正のものはアプリで書き写さず、API を呼ぶだけにする**。クライアントに残るものは Contracts の fixtures で
Web とアプリの両方をテストする（design.md §8）。

| 規則                                       | 正（2026-10-11）                                          | アプリでの扱い                                     |
| ------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------- |
| 入退室の文言と metadata                    | サーバー（`save-chat/messages.ts`）                       | `op` を送る。楽観的な表示の文言だけ Contracts から |
| 巫女の運勢 12 通りと文言                   | サーバー（`messages.ts`）                                 | 持たない（`extra` で届く）                         |
| 入力の上限・予約名・色の正規化             | サーバー（`save-chat/schema.ts`）                         | 画面の上限は Contracts から。最後の判定はサーバー  |
| metadata の許可リスト                      | サーバー（`schema.ts`）                                   | 選択肢（15 色・Size・アバター）を Contracts から   |
| 部屋 ID の正当性                           | サーバー（`rooms` 表の外部キー）                          | 一覧と題名は Contracts から                        |
| `clear` の対象                             | サーバー（`clear_my_chats`）                              | 返った uuid をログから外す                         |
| look / unlook を誰に鳴らすか               | サーバー（保存された発言の INSERT）                       | INSERT の本文で鳴らす                              |
| 楽観的表示と確定値の突き合わせ（nonce）    | クライアント（`optimisticLog.ts`）                        | 写す。fixtures で縛る                              |
| ログの並び（uuid v7 降順、二分探索で挿入） | クライアント（`roomLogStore.ts` の `mergeChatLogByUuid`） | 写す。fixtures で縛る                              |
| 取得中に届いた新着・書き換えの再適用       | クライアント（`roomLogStore.ts`）                         | 写す。fixtures で縛る                              |
| 参加者（5 分、`event` / `subject`）        | クライアント（`useParticipants.ts`）                      | 写す。fixtures で縛る                              |
| フィルタの一致（IP・名前・言葉）           | クライアント（`ipFilter.ts`）                             | 写す。fixtures で縛る                              |
| 日時の表記 `01/02(Wed) 20:10`              | クライアント（`shared/utils/format.ts`）                  | 写す。fixtures で縛る                              |
| 部屋の題名・紹介・カテゴリ（82 ID）        | クライアント（`rooms.ts`、`top/data.ts`）                 | Contracts から生成                                 |
| 分析イベントの契約                         | クライアント（`shared/utils/analytics.ts`）               | 型に写す                                           |

ツーショットの規則（`rules.ts`）は初めからサーバーが正で、クライアントは結果を描くだけ。

### 2.8 Web 版の弱点のうち、アプリ化で表に出るもの

- ~~管理人・巫女の発言をクライアントが作っている~~ → **解消**（PR #203。予約名の拒否、`system` はサーバーだけ）
- ~~`clear` は anon の UPDATE で、名前が一致すれば他人の発言でも消せる~~ → **解消**（`clear_my_chats`、UPDATE を閉じた）
- **削除済みの発言は API から読める**（`public-select` が `USING (true)`。Issue #185 は実装なしで閉じた）。[消す] は
  画面から消すだけ。requirements.md Q13
- **他人の名前で退室の発言を出せる**（`op: exit` は名前を確かめない。本人確認が無いのは以前と同じ）
- **通報・利用規約・プライバシーポリシー・児童の安全の基準が無い**（`docs/GROWTH_STRATEGY.md` §2）。
  Google Play では必須（§4.2）。閲覧者の端末で隠す「フィルタ」は入った（§2.9）が、運営に届く通報は無い
- **参加者は「直近 5 分の発言」から数えている。** 接続中の人数ではない
- **Realtime はタブを開いている間つながる前提。** アプリは裏に回ると接続を保てない（§4.1）

### 2.9 spec の後に Web で変わったこと（2026-09-28 〜 2026-10-11）

| 変更                                                       | PR / Issue        | アプリへの影響                                                                                   |
| ---------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| 規則のサーバーへの移行（§2.6・§2.7）                       | #189〜#203        | Q4 は決定済み。Phase 0 の大半が済んだ。アプリの `core:common` から運勢・入退室の組み立てが消える |
| 送信操作の ID で `insert_chat` が冪等（`chat_operations`） | #203（`5f3bcef`） | 再試行で二重に保存されない。アプリも全試行で同じ ID を送るだけでよい                             |
| フィルタ（IP・名前・言葉、ダブルタップ、確認の窓、振動）   | #167〜#174        | ブロック（R12.4）を Web と同じ規則にする（Q12）                                                  |
| mock のログをやめた                                        | #188 / #200       | アプリも出さない（初版の方針と同じ）                                                             |
| ツーショットを止めた（電気通信事業法の確認）               | hotfix            | Q3 は「入れない」のまま。Task 0.2 の法令の確認にチャット全体の届出の要否も含める                 |

## 3. 成長戦略との関係

`docs/GROWTH_STRATEGY.md` §6 は「モバイルアプリ化」を Impact 2 / Confidence 2 / Effort 5 の「今はしない」と判定し、
§7.1 で安全基盤（通報・ブロック・運用）を P0 の必須としている。本 spec はこの判定を覆すものではなく、次の立場を取る。

- 設計と基盤づくりは進めてよい。ただし**ストアに出す条件に安全基盤を置く**（§4.2 のとおり Play の要件でもある）
- 先に行うサーバー側の変更（管理人・巫女の発言をサーバーで作る、通報の API、規約とプライバシーポリシーのページ）は
  Web にも効くので、アプリを出すかどうかに関わらず価値がある（tasks.md Phase 0）
- Phase 0 を終えた時点で、成長戦略の指標（WRC など）を見て Phase 1 以降に進むかを決め直す（Gate 1）

## 4. 2026 年の Android の前提

### 4.1 プラットフォーム

- **targetSdk**: 2026-08-31 以降、Google Play に出す新規アプリと更新は Android 16（API 36）以上を対象にする必要がある
  （延長の申請で 2026-11-01 まで）
- **Android 17（API 37）**: 2026-06 に公開された。API 37 を対象にすると、画面の最小幅が 600dp を超える端末
  （タブレット・折りたたみを開いたとき）では、向き・リサイズ・縦横比の制限（`screenOrientation`、
  `resizeableActivity=false`、`min/maxAspectRatio`）が無視され、Android 16 にあった一時的な opt-out も無くなる。
  **縦固定の電話向けレイアウトだけでは出せない**。ゲームは対象外だが、本アプリは当たらない
- **edge-to-edge**: API 35 を対象にすると強制され、API 36 で opt-out が無くなった。ステータスバーとナビゲーションバーの
  裏まで描き、insets で逃がす
- **予測型「戻る」**: API 36 を対象にすると既定で有効になり、`onBackPressed` は呼ばれない。戻る操作は
  Navigation 3 / `PredictiveBackHandler` で扱う
- **通知の許可**: Android 13 以降は `POST_NOTIFICATIONS` の実行時の許可が要る
- **バックグラウンド**: チャットの接続を保つための foreground service は、Android 14 以降の型の制約に合う用途が無い。
  裏に回ったら接続を閉じ、戻ったら取り直す（Web の「`connected` に戻ったら取り直す」と同じ規則で足りる）
- **16 KB ページサイズ**: API 35 以上を対象にする Play のアプリは、ネイティブライブラリを含むなら 16 KB ページに
  対応する必要がある。依存にネイティブコードが入ったら確かめる

### 4.2 Google Play のポリシー（本アプリに直接効くもの）

- **匿名チャット・ランダムチャット**（2026-07-15 の告知、既存アプリの期限 2026-08-26）: 匿名チャット・ランダム
  チャットのアプリは「Age-Restricted Content and Functionality」の対象になり、**未成年をブロックする**必要がある。
  Play Console の「Restrict Minor Access」を使い、対象年齢を 18 歳以上だけにする。Families ポリシーは匿名チャットの
  アプリが子どもを対象にすることを禁じた
- **Child Safety Standards**: 匿名チャット・ランダムチャット・Social・Dating のアプリは、(1) 児童の性的虐待と搾取
  （CSAE）を禁じる基準を公開し、(2) アプリの中に通報の仕組みを持ち、(3) CSAM を知ったら削除などの対応をし、
  (4) Google からの連絡を受ける担当者を指定し、(5) 児童の安全に関する法令に従う、ことを自己申告する
- **UGC（利用者が作るコンテンツ）**: 利用規約への同意、アプリ内でのコンテンツと利用者の通報、ブロック、継続的な
  モデレーションが要る
- **プライバシーポリシーとデータセーフティ**: プライバシーポリシーの URL と、データセーフティ欄の申告が要る
- **テスト**: 2023-11 以降に作った個人のデベロッパーアカウントは、本番公開の前に 12 人以上のテスターで 14 日間の
  クローズドテストが要る

お気楽チャットは登録不要・ハンドルネームの匿名チャットなので、**アプリは 18 歳以上に限ることになる**。すると、
18 歳以上のアプリに「小学生チャット」「中学生チャット」などの部屋が並ぶことになり、児童の安全の観点で危ういうえに
意味が通らない。ツーショットチャットは見知らぬ相手と 1 対 1 で話し、性別と待機用プロフィールを出すので、ランダム
チャットやデーティングに近いと見られるおそれがあり、日本の法令（インターネット異性紹介事業の規制など）の確認も
要る。どちらも requirements.md の「決めること」Q2 / Q3 で扱う。

> 注: 調査環境から `support.google.com` と `android-developers.googleblog.com` を直接開けなかったため、上の要約は
> 検索結果と二次情報による。着手時（tasks.md Task 0.1）に Play Console と公式ドキュメントの原文で確かめ直す。

### 4.3 アーキテクチャの推奨

- **公式のアプリ設計ガイド**: UI 層（Compose + ViewModel、UI の状態は `StateFlow`）とデータ層（Repository が
  データの正本）、単方向データフロー。必要ならドメイン層
- **Jetpack Compose**: Compose コンパイラの strong skipping は既定で有効。React Compiler と同じく、手でメモ化しなくても
  安定な入力なら再コンポーズを飛ばす。安定・不変なモデル（`@Immutable`、不変なコレクション）を渡すことが前提
- **Navigation 3**: 2025-11-19 に 1.0 が stable。バックスタックをアプリの状態として持ち、Scene で 1 画面に複数の
  行き先を並べられる（リスト・詳細）
- **Compose Material 3 Adaptive**: ウィンドウサイズクラス、リスト・詳細のペイン、ナビゲーションの出し分け
- **Material 3 Expressive**: 2026-09 時点で `material3` 1.5.0 の alpha（2026-09-23 に alpha29）にしかない。
  初版は stable の Material 3 を使い、Expressive は stable になってから取り込む
- **性能**: Baseline Profile / Startup Profile、R8、Macrobenchmark
- **Kotlin Multiplatform**: Google が業務ロジックの共有に公式に対応している。TypeScript のコードは共有できないが、
  モデルとデータ層を Android に依存しない Kotlin で書いておけば、将来 iOS を作るときに使える

### 4.4 Supabase の Kotlin クライアント

`supabase-kt`（`supabase-community`、Supabase のドキュメントに Kotlin の参照として載っている）に `postgrest-kt`・
`realtime-kt`・`functions-kt` があり、Ktor のエンジンで動く。コミュニティの保守なので、アプリのコードからは
直接呼ばず、インターフェースの後ろに置く。トップの人数やツーショットのように、Web でも SDK を使わず素の `fetch`
で呼んでいるものは、アプリでも Ktor で直接呼べる。

## 5. Web とアプリで変わること

| 項目         | Web                                  | アプリ                                       | 方針                                        |
| ------------ | ------------------------------------ | -------------------------------------------- | ------------------------------------------- |
| 画面の移動   | 全ページ読み込み（MPA）              | 同じプロセスの中で移動                       | 戻ったときに前の画面の状態が残る            |
| 接続         | タブを開いている間                   | 前面にある間。裏に回ったら 5 秒後に閉じる    | 戻ったら取り直す                            |
| 保存         | `localStorage` / `sessionStorage`    | DataStore / メモリ                           | Web の保存値は引き継げない                  |
| 音           | Web Audio。操作で解錠が要る          | SoundPool。マナーモードに従う                | アプリ内の設定で切れるようにする            |
| 戻る         | ブラウザの戻る（退室の発言は出ない） | システムの戻る（予測型）                     | 決めること Q5                               |
| リンク       | URL                                  | App Links（`assetlinks.json` が要る）        | `gh-pages` は既定でドットファイルを出さない |
| SEO / SSG    | 要る                                 | 要らない                                     | 部屋紹介（`RoomInfo`）は画面の中に残す      |
| 広告・X      | あり                                 | 初版は出さない                               | 決めること Q9                               |
| 年齢         | 制限なし                             | 18 歳以上                                    | 決めること Q2                               |
| 画面の大きさ | レスポンシブ（`lg` で 3 列）         | 電話・折りたたみ・タブレット・デスクトップ窓 | ウィンドウサイズクラスで出し分ける          |

`gh-pages -d dist` は既定でドットファイル（`.well-known/`）を公開しない。App Links に要る
`/.well-known/assetlinks.json` を出すには、`--dotfiles` を付け、`.nojekyll` を置いて、公開後に取得できることを
確かめる必要がある（tasks.md Task 0.9）。

## 6. 参照

- [Target API level requirements for Google Play apps](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- [Android 17 is here（Android Developers Blog, 2026-06）](https://android-developers.googleblog.com/2026/06/Android-17.html)
- [Prepare your app for the resizability and orientation changes in Android 17](https://developer.android.com/blog/posts/prepare-your-app-for-the-resizability-and-orientation-changes-in-android-17)
- [Restrictions on orientation and resizability are ignored（Android 17）](https://developer.android.com/about/versions/17/changes/ff-restrictions-ignored)
- [Policy announcement: July 15, 2026](https://support.google.com/googleplay/android-developer/answer/17134731)
- [Age-Restricted Content and Functionality](https://support.google.com/googleplay/android-developer/answer/16302250?hl=en)
- [Learning more about our Child Safety Standards policy](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en)
- [Jetpack Navigation 3 is stable](https://developer.android.com/blog/posts/jetpack-navigation-3-is-stable)
- [Compose Material 3 releases](https://developer.android.com/jetpack/androidx/releases/compose-material3)
- [Compose Material 3 Adaptive releases](https://developer.android.com/jetpack/androidx/releases/compose-material3-adaptive)
- [supabase-kt](https://github.com/supabase-community/supabase-kt) / [Supabase Kotlin API Reference](https://supabase.com/docs/reference/kotlin/introduction)
- リポジトリ内: `docs/ARCHITECTURE.md`、`docs/GROWTH_STRATEGY.md`、`.kiro/specs/react-2026-refactoring/`、
  `.kiro/specs/two-shot-chat/`
