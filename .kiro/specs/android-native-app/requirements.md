# Requirements Document: android-native-app

## Introduction

お気楽チャットTS（`https://www.okiraku.chat/`）の Android ネイティブアプリを作る。

- **見た目と振る舞いは Web 版と同じにする。** レトロな配色・書体（DotGothic16）・立体の罫線・文言・ボタンの並び、
  新しい発言が上に来るログ、上下に分かれて境界を動かせる画面、コマンド（`clear` / `look` / `おみくじ` など）を
  そのまま持ち込む。正解は Web 版と比べて決める（Web_Oracle）
- **骨格は 2026 年の Android にする。** Kotlin と Jetpack Compose、UI 層とデータ層を分けた単方向データフロー、
  Navigation 3、edge-to-edge、予測型「戻る」、電話から折りたたみ・タブレットまで同じアプリで動くアダプティブな画面
- **Web と同じ部屋で会話する。** 同じ Supabase の同じテーブルに同じ形で読み書きし、Web の利用者とアプリの利用者が
  互いの発言を同じ見た目で見る。アプリ専用の部屋やログは作らない
- **ストアに出す条件に安全基盤を置く。** Google Play は 2026 年から匿名チャットのアプリに未成年のブロックと児童の
  安全の基準を求めている（research.md §4.2）。通報・ブロック・利用規約・公開の基準・担当窓口をそろえるまで公開しない

調査の詳細は [research.md](./research.md)、設計は [design.md](./design.md)、作業の順序は [tasks.md](./tasks.md)。

既存の spec・文書との関係:

- [`react-2026-refactoring`](../react-2026-refactoring/requirements.md) で整えた Web のデータの流れ（Room_Log_Store、
  楽観的表示、Chat_Session）を、アプリのデータ層の手本にする
- [`two-shot-chat`](../two-shot-chat/requirements.md) の「Oracle と比べて受け入れる」やり方を、Web_Oracle として使う
- [`docs/GROWTH_STRATEGY.md`](../../../docs/GROWTH_STRATEGY.md) は「モバイルアプリ化」を「今はしない」と判定している。
  本 spec はその判定を覆さず、公開の前に Gate を置く（research.md §3）

## Glossary

- **Android_App**: 本 spec で作る Android アプリ
- **Web_App**: 既存の Web 版（`https://www.okiraku.chat/`）
- **Web_Oracle**: 見た目と振る舞いの正解を出す Web_App（ローカルの `pnpm dev`、Storybook、本番）。Android_App は
  同じ状態を作って Web_Oracle と見比べて受け入れる
- **Retro_Design_System**: Web の `theme.css` と共通部品（`Button`・`Input`・`Divider`・`RetroSplitter` など）を
  Compose に移したもの（`:core:designsystem`）
- **Room_Log_Repository**: Web の Room_Log_Store（`roomLogStore.ts`）と同じ規則で、部屋ごとのログの取得・購読・
  取り直しをまとめる Android_App のデータ層
- **Chat_Session**: 入室・退室・発言・コマンドをまとめたもの（Web の `useChatSession`）
- **Contracts**: Web と Android_App が共有する JSON（部屋の一覧、表示の期待値、API の応答の例）。`contracts/` に置く
- **Safety_Kit**: 利用規約への同意、通報、ブロック、公開の基準（CSAE の禁止を含む）、担当窓口の一式
- **App_Room_Scope**: Android_App に出す部屋の集合（決めること Q2）
- **Window_Size_Class**: 画面の幅による区分。Compact（600dp 未満）/ Medium（600〜840dp）/ Expanded（840dp 以上）
- **Gate**: 次の Phase に進むかを決め直す判断の場（tasks.md）

## 決めること

推奨を先頭に書いた。推奨どおりなら本 spec の他の部分はそのまま使える。

| ID  | 論点                                   | 推奨                                                                                                    | ほかの案                                                                          |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Q1  | 作り方                                 | **Kotlin + Jetpack Compose のネイティブ**                                                               | TWA（Web をそのまま包む）、React Native、Capacitor（design.md「採らなかった案」） |
| Q2  | 年齢と部屋                             | **18 歳以上に限り、未成年を想定した部屋（小学生・中学生・中学生３・高校生・１０代）はアプリに出さない** | 18 歳以上で全部屋を出す／年齢を限らない（Play に出せない）                        |
| Q3  | ツーショットチャット                   | **初版に入れない。**法令の確認の後で決める                                                              | 初版に入れる                                                                      |
| Q4  | 管理人・巫女の発言と `clear`           | **Phase 0 でサーバーへ移す**（Web も同じ API に切り替える）                                             | アプリも Web と同じくクライアントで作る                                           |
| Q5  | 入室中にシステムの「戻る」を押したとき | **[退室] と同じにする**（退室の発言を出して部屋一覧へ戻る）                                             | Web と同じく何も出さずに離れる／確認のダイアログを出す                            |
| Q6  | リポジトリ                             | **同じリポジトリの `android/`**（Contracts と CI を共有する）                                           | 別のリポジトリ                                                                    |
| Q7  | 通知                                   | **初版は無し。**成長戦略 §7 の条件（会話が成立した後・イベントへの参加表明）でイベント通知だけ後から    | 初版から look を通知する                                                          |
| Q8  | 夜間の配色                             | **初版は無し**（Web と同じ明るい配色。システムバーだけ合わせる）                                        | 夜間用の配色を作る                                                                |
| Q9  | 広告と X の埋め込み                    | **出さない**（X はリンクだけ）                                                                          | WebView で埋め込む                                                                |
| Q10 | applicationId                          | **`chat.okiraku.app`**（公開後は変えられない）                                                          | `chat.okiraku.android` など                                                       |
| Q11 | minSdk                                 | **28（Android 9）**。GIF を標準のデコーダで動かせ、国内の端末をほぼ覆う。GA4 の実データで確かめて確定   | 26                                                                                |

## Requirements

優先度: **P0** = 初版に必須、**P1** = 初版に入れたいが後の PR でもよい、**P2** = 初版の後。

### Requirement 1: プラットフォームと基盤（P0）

**User Story:** 利用者として、今の Android 端末で、ほかのアプリと同じ作法で動くアプリを使いたい。

#### Acceptance Criteria

1. THE Android_App SHALL Kotlin と Jetpack Compose で画面を作る。View システムの画面（XML レイアウト）を持たない。
2. THE Android_App SHALL targetSdk を 36 以上にする（Android 17 の対応を終えたら 37）。minSdk は Q11 に従う。
3. THE Android_App SHALL edge-to-edge で描き、ステータスバー・ナビゲーションバー・画面の切り欠き・キーボードの領域を
   insets で避ける。操作できる部品がシステムの領域と重ならない。
4. THE Android_App SHALL 予測型「戻る」に対応し、戻る先の画面を「戻る」の操作の途中で見せる。
5. THE Android_App SHALL 画面の回転とウィンドウの大きさの変更で入力中の文字・入室状態・スクロール位置を失わない。
6. THE Android_App SHALL 表示言語を日本語だけにする（アプリ別の言語設定に日本語だけを出す）。

### Requirement 2: Web と同じデータ（P0）

**User Story:** アプリの利用者として、Web で話している人と同じ部屋で話したい。

#### Acceptance Criteria

1. THE Android_App SHALL Web_App と同じ Supabase プロジェクトの同じテーブル・同じ部屋 ID に読み書きする。
2. WHEN Android_App から発言する, THE Web_App SHALL その発言を Web_App から発言したときと同じ見た目で表示する
   （名前の色、アバター、書式、日時、マスク済み IP）。逆も同じ。
3. THE Android_App SHALL Web_App が知らない項目を `chats` の行や `metadata` に足さない。足すときは Requirement 21 の
   サーバーの契約として両方に入れる。
4. THE Android_App SHALL `ip` と `ua` を送らない（サーバーが観測する）。
5. THE Android_App SHALL 部屋の ID・題名・紹介文・カテゴリを Contracts から作り、Web の `rooms.ts` とずれたら CI で
   失敗する。

### Requirement 3: ホーム（部屋一覧）（P0）

**User Story:** 利用者として、どの部屋に何人いるかを見て、入る部屋を選びたい。

#### Acceptance Criteria

1. THE ホーム SHALL Web のトップの左カラム（`chatDirectoryGroups`）と同じ順・同じ見出し・同じ補足・同じ色で、
   カテゴリごとに部屋の名前と人数（「n人」）を並べる。
2. THE ホーム SHALL 人数を `room_participant_counts` から取る。取れないときは Web と同じく「0人」で表示を続ける。
3. THE ホーム SHALL ピックアップ、チャットの使い方、ルール・マナー、安全ガイド、利用規約、プライバシーポリシー、
   コンタクト（管理者チャット）への導線を持つ。
4. WHEN 部屋を選ぶ, THE Android_App SHALL その部屋の入室前の画面を開く。
5. THE ホーム SHALL App_Room_Scope に入らない部屋を出さない。
6. WHEN アプリが前面に戻る, THE ホーム SHALL 人数を取り直す。ただし直前の取得から 60 秒たっていなければ取らない。

### Requirement 4: 入室（P0）

**User Story:** 利用者として、Web と同じフォームで名前や色を決めて部屋に入りたい。

#### Acceptance Criteria

1. THE 入室フォーム SHALL Web の `EntryForm` と同じ項目・同じ順・同じ文言を持つ: 部屋の題名、おなまえ（24 文字、
   「記入してね！」）、[チャットに参加する]・[リセット]、名前の色（12 文字）と「カラーナビ」、こっそり、
   E-Mail/URL（64 文字、「任意」）、アバター 14 種。
2. WHEN 名前が空か 24 文字を超える, THE 入室フォーム SHALL 入室せず「おなまえは必須です」「おなまえは24文字以内」を出す。
3. WHEN 入室する, THE Android_App SHALL 保存を待たずに発言の画面へ切り替え、こっそりでなければ入室の発言を出し、
   ログの取得を 100 件へ広げる。
4. IF 入室の発言の保存に失敗する, THEN THE Android_App SHALL 入室前の画面へ戻し、Web と同じ文言でエラーを出す。
5. WHEN 入室に成功する, THE Android_App SHALL 名前・色・メール・アバターを端末に保存し、次に開いたときの既定値にする。
6. WHEN [リセット] を押す, THE 入室フォーム SHALL 名前・メールを空に、色を `#ff69b4` に、アバターを「なし」に戻し、
   保存した値も消す。
7. THE 入室フォーム SHALL 部屋の紹介文とカテゴリ、同じカテゴリのほかの部屋へのリンクを下に出す（Web の `RoomInfo`）。

### Requirement 5: 発言とコマンド（P0）

**User Story:** 利用者として、Web と同じ操作で発言し、コマンドを使いたい。

#### Acceptance Criteria

1. THE 発言フォーム SHALL Web の `ChatRoom` と同じ並びを持つ: [退室] [ランキング]、[更新] [発言] [消す] と
   「おなまえ: 名前」、発言欄（120 文字）、ログ行数・Size・色・細字。
2. WHEN 発言する（[発言] かキーボードの送信キー）, THE Android_App SHALL 発言欄をすぐ空にし、自分の発言を「送信中...」
   でログの先頭に出し、保存が終わったら確定した日時とマスク済み IP に置き換える。
3. IF 保存に失敗する, THEN THE Android_App SHALL 楽観的な発言を消し、「発言を送信できませんでした。時間をおいてもう一度
   お試しください。」を出す。保存は Web と同じ間隔で最大 3 回試す。
4. THE Android_App SHALL 発言に書式（Size・色・太字）とアバターを Web と同じ `metadata` の形で付ける
   （既定値は省き、太字は既定で付ける）。
5. THE Android_App SHALL コマンドを Web と同じに扱う: `cut` は何もしない、`clear` と [消す] は自分の名前の発言を消す、
   `look` は自分と同じ部屋の人に通知音を鳴らし、`unlook` は止める、`おみくじ` には巫女が運勢を返す。
6. WHEN 送信が終わる, THE 発言フォーム SHALL 発言欄にフォーカスを戻す。ほかの人の発言が届いてもフォーカスを奪わない。
7. WHEN 発言・[更新]・[消す] を押す, THE Android_App SHALL ランキングを閉じてログの表示へ戻す。

### Requirement 6: ログの表示（P0）

**User Story:** 利用者として、Web と同じ見た目のログを読みたい。

#### Acceptance Criteria

1. THE ログ SHALL 新しい発言を上に並べ、ログ行数で選んだ件数まで出す。
2. THE ログ SHALL 先頭に「`[HH:MM] 参加者(n):` 名前…」と Web と同じ固定の文言を出し、参加者を直近 5 分の発言と入退室の
   発言から求め、分が変わるたびに求め直す。
3. THE ログ SHALL 発言を Web の `ChatMessage` と同じ形で出す: アバター、名前（1.08em、名前の色）、`>`（メールがあれば
   リンク）、本文（書式、URL はリンク）、`look` のきらめき、`(01/02(Wed) 20:10 219.107.106.*)`。発言ごとに区切り線。
4. THE ログ SHALL 管理人の発言と入室の 2 行目（UA・訪問回数・LAST LOGIN）、「Issue #N」のリンクを Web と同じに出す。
5. WHEN ログの先頭を表示している間に新着が届く, THE ログ SHALL 新着が見えるように先頭に留まる。WHEN 古い発言を読んで
   いる, THE ログ SHALL 読んでいる位置を動かさない。
6. THE ログ SHALL 読み込み中・取得の失敗（[再読み込み]）・発言なし（「まだ発言はありません。」）を Web と同じ文言で出す。
7. THE ログ SHALL 1000 行を表示しても、中位の端末で滑らかにスクロールできる（Requirement 19）。
8. THE ログ SHALL 本文を長押しで選択・コピーできる。リンクはアプリ内のブラウザ（Custom Tabs）で開き、メールは
   メールアプリに渡す。

### Requirement 7: 分割画面（P0）

**User Story:** 利用者として、Web と同じく入力とログの境界を動かしたい。

#### Acceptance Criteria

1. THE 部屋の画面 SHALL 上に入力（入室前は入室フォーム、入室後は発言フォーム）、下にログを置き、境界線で分ける。
2. THE 境界線 SHALL ドラッグで動き、上下とも 100dp より小さくならない。初期の高さは Web と同じ（入室前 26%、
   Expanded では 24%、入室後 18%）にする。
3. THE 境界線 SHALL 支援技術から「広げる」「狭める」の操作ができる。
4. WHEN キーボードが開く, THE 部屋の画面 SHALL 入力のペインを隠さず、ログのペインを縮める。
5. WHEN 入室前と入室後が切り替わる, THE 境界線 SHALL その画面の初期の高さに戻る（Web と同じ）。

### Requirement 8: リアルタイムと接続（P0）

**User Story:** 利用者として、ほかの人の発言がすぐ届き、アプリを行き来しても取りこぼしたくない。

#### Acceptance Criteria

1. WHILE 部屋の画面が前面にある, THE Android_App SHALL その部屋の新着を Realtime で受ける。
2. WHEN Realtime の接続が `connected` に戻る, THE Room_Log_Repository SHALL ログを取り直す（切れていた間の取りこぼしを
   埋める）。
3. WHEN アプリが裏に回って 5 秒たつ, THE Android_App SHALL Realtime の接続を閉じる。WHEN 前面に戻る, THE Android_App
   SHALL つなぎ直して取り直す。
4. WHEN 同じ部屋の誰かが `look` を送る, THE Android_App SHALL 前面にあれば通知音を鳴らす。`unlook` で止める。
   マナーモードとアプリ内の「音を鳴らす」の設定に従う。
5. IF 接続できない, THEN THE Android_App SHALL 取得済みのログを残したまま、つながっていないことを示す。Web の
   オフライン時の見本データ（mock）は出さない。
6. THE Android_App SHALL 同じ部屋の購読を 1 つにまとめる（画面が複数あっても channel は 1 つ）。

### Requirement 9: ランキング（P1）

#### Acceptance Criteria

1. WHEN [ランキング] を押す, THE 部屋の画面 SHALL ログの代わりに全期間の発言数ランキング（`chat_ranking`）を出す。
2. WHEN 見出しの部屋名・[更新]・発言でログへ戻る, THE ログ SHALL 作り直さず、前のスクロール位置のまま戻る。

### Requirement 10: 全部屋まとめ（P1）

#### Acceptance Criteria

1. THE 全部屋まとめ SHALL App_Room_Scope の全部屋の新着を 1 つのログに出し、各発言に部屋名を添える。
2. WHEN 部屋名を押す, THE 全部屋まとめ SHALL 返信先をその部屋にし、「→ 部屋名 に返信中」を出す。押すとまとめに戻す。
3. THE 全部屋まとめ SHALL 入退室の発言を `all` に出し、`clear` は返信先の部屋の自分の発言だけを消す（Web と同じ）。
4. THE 全部屋まとめ SHALL App_Room_Scope に入らない部屋の発言を出さない。

### Requirement 11: ちゃなり（P1）

#### Acceptance Criteria

1. THE ちゃなりの画面 SHALL Web の `chanari.css` の見た目（配色・ヘッダー・フォーム）を再現する。
2. THE ちゃなりの画面 SHALL 名前色・発言色・リロード秒・エフェクト・文字サイズ・AT フィールド・文字数カウンタ・
   下書きの復元を Web と同じに持つ。エフェクト・文字サイズ・AT フィールドは Web と同じく選べるだけで発言に反映しない。
3. WHILE 入室中で Realtime が切れている, THE ちゃなりの画面 SHALL リロード秒ごとに取り直す（Web と同じ）。
4. THE ちゃなりの画面 SHALL 部屋ごとの下書き（名前・色・最後の発言）を端末に保存し、1 年を過ぎたものは捨てる。

### Requirement 12: 安全（P0、公開の条件）

**User Story:** 利用者として、嫌な発言を通報し、見たくない相手を消したい。運営者として、通報を受けて対応したい。

#### Acceptance Criteria

1. WHEN 初めて起動する, THE Android_App SHALL 18 歳以上であることの確認と、利用規約・プライバシーポリシー・安全ガイドへの
   同意を求め、同意するまで部屋に入れない。規約の版が上がったら同意を取り直す。
2. THE ログ SHALL 各発言から 2 操作以内で通報できる（長押し → 「通報する」）。理由を選び、任意で説明（500 文字）を足せる。
3. WHEN 通報する, THE Android_App SHALL 通報をサーバーに保存し（Requirement 21.4）、受け付けたことを示す。
4. THE Android_App SHALL 発言者を端末の中で非表示にできる（ブロック）。非表示にした相手の発言はログと参加者に出さない。
   設定から一覧を見て解除できる。
5. THE Web_App SHALL 児童の性的虐待と搾取（CSAE）を禁じる基準を含む安全ガイドを公開し、Android_App はそこへリンクする。
6. THE 運営 SHALL Google からの連絡を受ける児童の安全の担当窓口を決め、Play Console に登録する。
7. THE Android_App SHALL 電話番号・メールアドレス・SNS の ID などの外部の連絡先を含む発言を、送る前に警告する（P1）。

### Requirement 13: 年齢と部屋の範囲（P0）

#### Acceptance Criteria

1. THE Android_App SHALL Play Console で対象年齢を 18 歳以上だけにし、「Restrict Minor Access」を有効にする（Q2）。
2. THE Android_App SHALL App_Room_Scope に入らない部屋を、ホーム・全部屋まとめ・部屋のリンク・ディープリンクの
   どこからも開けない。ディープリンクで開こうとしたらホームを出す。
3. THE App_Room_Scope SHALL Contracts の中で部屋ごとに持ち、Web と同じ部屋の定義から作る。
4. THE Android_App SHALL ツーショットチャットを初版に含めない（Q3）。

### Requirement 14: デザインシステム（P0）

**User Story:** 利用者として、Web で見慣れたレトロな見た目のまま、読みやすく押しやすいアプリを使いたい。

#### Acceptance Criteria

1. THE Retro_Design_System SHALL Web の `theme.css` の色（`#c1fc92`、`#ff69b4`、`#ffe4ef`、`#b1b1b1`、`#4a90e2`、
   `#f3f3f3` ほか）を唯一の定義から持つ。
2. THE Retro_Design_System SHALL DotGothic16 をアプリに同梱し、Web と同じ書体の並び（DotGothic16 → 端末の日本語書体）で
   表示する。ライセンス（SIL OFL）をアプリ内に出す。
3. THE Retro_Design_System SHALL Web の `Button`（外側に盛り上がった 2px の罫線とグラデーション、押すと凹む）、`Input`
   （凹んだ 2px の罫線、フォーカスで青）、`select`、チェックボックス、ラジオ、`Divider`、境界線を Compose の部品にする。
4. THE Retro_Design_System SHALL 端末の文字の大きさ（200% まで）に従って拡大し、拡大しても入力と操作が切れない。
5. THE Retro_Design_System SHALL 見た目が小さい部品（`[退室]` などのリンク）でも、押せる範囲を 48dp 四方以上にする。
6. THE Retro_Design_System SHALL 端末の壁紙から色を作る動的カラーを使わない。Material の部品（ダイアログ、
   スナックバー、ボトムシート）はレトロの配色から作ったテーマで出す。
7. THE Retro_Design_System SHALL 「アニメーションを減らす」設定のとき、GIF のアバターときらめきを止めた絵で出す。

### Requirement 15: 大きな画面（P0）

**User Story:** 折りたたみ端末やタブレットの利用者として、画面を広く使いたい。

#### Acceptance Criteria

1. THE Android_App SHALL 向き・サイズ・縦横比を固定しない（Android 17 では固定できない）。
2. WHILE Window_Size_Class が Expanded, THE Android_App SHALL 部屋一覧と部屋の画面を左右に並べ、部屋を選ぶと右側だけ
   切り替える。
3. WHILE Window_Size_Class が Compact, THE Android_App SHALL 部屋一覧と部屋の画面を 1 枚ずつ出す。
4. WHEN 折りたたみを開閉する・ウィンドウの大きさが変わる, THE Android_App SHALL 入室状態と入力中の文字を保つ。
5. THE Android_App SHALL 物理キーボードの Enter で発言でき、境界線を矢印キーで動かせる（Web と同じ）。

### Requirement 16: リンクから開く（P1）

#### Acceptance Criteria

1. WHEN `https://www.okiraku.chat/chat/<id>/` か `/chanari/<id>/` を開く, THE Android_App SHALL（入っていれば）その部屋を
   開く（App Links）。App_Room_Scope の外ならホームを出す。
2. THE Web_App SHALL `/.well-known/assetlinks.json` を公開し、アプリの署名証明書のハッシュを載せる。
3. THE Android_App SHALL 部屋の画面から「この部屋を共有」で部屋の URL（末尾 `/` 付き）を共有シートに渡す。

### Requirement 17: 計測と監視（P1）

#### Acceptance Criteria

1. THE Android_App SHALL Web の GA4 と同じプロパティに Android のデータストリームを足し、`analytics.ts` と同じ
   イベント名・パラメータを送る。本文・名前・メール・URL は送らない。
2. THE Android_App SHALL クラッシュと ANR を集め、発言の保存を New Relic の分散トレースで `save-chat` とつなぐ
   （`traceparent`、`x-chat-operation-id`）。
3. THE Android_App SHALL 計測の同意を設定で切れるようにする。

### Requirement 18: プライバシー（P0）

#### Acceptance Criteria

1. THE Web_App SHALL プライバシーポリシーを公開し、Android_App と Play のストア掲載からリンクする。
2. THE 運営 SHALL Play のデータセーフティ欄に、送る情報（名前・発言・任意のメール・サーバーが観測する IP と UA・
   計測・クラッシュ）を申告する。
3. THE Android_App SHALL ログを端末に保存するときは直近のものに限り、ブロックの一覧と設定だけを長く保存する。
   Android のバックアップに入室の情報とログを含めない。
4. THE Android_App SHALL 設定から、端末に保存した情報（名前・色・下書き・ブロックの一覧・ログ）をまとめて消せる。

### Requirement 19: 性能（P1）

#### Acceptance Criteria

1. THE Android_App SHALL 中位の端末で、冷えた状態から起動してホームの部屋一覧が出るまでを 1.5 秒以内（中央値）にする。
2. THE ログ SHALL 1000 行のスクロールで、フレームの遅れを 1% 未満にする（Macrobenchmark）。
3. THE Android_App SHALL 発言してから自分の発言がログに出るまでを 100ms 以内にする（楽観的表示）。
4. THE Android_App SHALL Baseline Profile を同梱する。ダウンロードの大きさはフォント込みで 15MB 以内を目安にする。

### Requirement 20: 品質保証（P0）

#### Acceptance Criteria

1. THE 各画面 SHALL Web_Oracle と同じ状態（Storybook のストーリーと同じデータ）で撮ったスクリーンショットと並べて確かめ、
   部品の並び・文言・色・罫線が一致する。
2. THE Room_Log_Repository・楽観的表示・参加者・日時の表記 SHALL Web のテストと同じ入力と期待値（Contracts）で
   テストする。
3. THE Android_App SHALL アプリの発言を Web で、Web の発言をアプリで表示して同じになることを、ローカルの Supabase で
   確かめる。
4. THE CI SHALL `android/` か `contracts/` か `supabase/functions/` が変わった PR で、Lint・単体テスト・スクリーンショット
   テスト・ビルドを走らせる。

### Requirement 21: サーバー側の変更（P0）

**User Story:** 運営者として、アプリと Web が同じ規則で動き、発言の偽装や他人の発言の消去を防ぎたい。

#### Acceptance Criteria

1. THE `save-chat` SHALL 入室・退室の管理人の発言と、`おみくじ` への巫女の返事をサーバーで作る。クライアントが送る
   `metadata.kind` の `admin` / `fortune` と `system` は、Web の切り替えが終わったら受け付けない（Q4）。
2. THE `clear` SHALL サーバーの SQL 関数（RPC）で行い、その端末が書いた発言だけを消す（端末ごとの秘密の値のハッシュで
   照合する）。anon の `UPDATE` は Web の切り替えの後に閉じる。
3. THE 変更 SHALL 移行の間、今の Web の送り方を壊さない。
4. THE 通報 SHALL 新しい Edge Function で受け、`service_role` だけが読める表に保存する。同じ接続元からの通報を
   時間あたりで制限する。通報の本文は公開の Issue に載せない。
5. THE `contracts/` SHALL `rooms.ts` などから生成し、生成し直した結果が入っているものと違えば CI で失敗する。
6. THE サーバー SHALL 入力の上限と形式、`metadata` の許可リスト、部屋 ID の正当性を確かめ、`look` / `unlook` の通知は
   保存された発言から導く（`docs/SERVER_SIDE_LOGIC_REFACTORING.md` の S1〜S4・S8）。1〜6 の移し方と性能の確かめ方は
   同書を正とする。

### Requirement 22: 通知（P2）

#### Acceptance Criteria

1. THE Android_App SHALL 起動直後に通知の許可を求めない。会話が成立した後か、イベントへの参加を表明した後に、
   理由を示してから求める（成長戦略 §7）。
2. THE 通知 SHALL イベントの開始、参加を表明した予定、自分で選んだ部屋の開催だけにし、種類ごとに切れるようにする。

### Requirement 23: ツーショットチャット（P2）

#### Acceptance Criteria

1. WHEN 法令の確認と Play のポリシーの確認で問題がないと決まる, THE Android_App SHALL ツーショットチャットを Web の
   `two-shot` の API と同じ規則で加える。会話は端末に保存しない。

### Requirement 24: 配布（P0）

#### Acceptance Criteria

1. THE Android_App SHALL Google Play で App Bundle として配布し、Play App Signing を使う。
2. THE 運営 SHALL 本番公開の前に内部テストとクローズドテスト（12 人以上・14 日間）を行う。
3. THE Android_App SHALL 新しい版があるとき、アプリ内のアップデートの案内（In-App Updates）を出す。
4. THE ストア掲載 SHALL 18 歳以上向けであること、匿名のチャットであること、通報とブロックがあることを明記し、
   未成年を集めるような文言・画像を使わない。

## 対象外

- iOS アプリ（データ層を Android に依存しない Kotlin で書き、Kotlin Multiplatform に移せる形にはしておく）
- 会員登録・ログイン
- オフラインでの発言の予約送信（Web と同じく、つながっていなければ送信は失敗として示す）
- Web の `localStorage` からの設定の引き継ぎ
- Web の SEO・SSG・Speculation Rules に当たる仕組み
