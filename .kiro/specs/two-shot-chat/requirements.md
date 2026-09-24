# Requirements Document: two-shot-chat

## Introduction

CGI-RESCUE の「2SHOT-CHAT v5.0.1」（Perl CGI、2011 年）を、2026 年の React の設計（React 19 の Actions、外部ストア、
React Compiler、純粋なレンダー）で作り直し、`https://www.okiraku.chat/chat/2shot/` に置く。ちゃなり
（`/chanari/<id>/`）と同じく、既存のチャット UI とは別の画面にする。

- **見た目は原作と同じにする。** フレームで上下に分かれた画面、表の罫線、色、文言、ボタンの並び、確認ダイアログ、
  自動更新のラジオで発言欄が空になるといった操作の癖まで再現する（発言後の発言欄は D20 で変えた）。正解は原作をローカルで動かした Oracle と比べて決める
  （[research.md](./research.md) §2）
- **中身は作り直す。** ファイル 3 つ（`ent` / `mes` / `log`）と URL に載せた認証コードの代わりに、Supabase の
  テーブルと Edge Function、タブごとのセッショントークンを使う。原作の不具合のうち、部屋を乗っ取れるもの・誰でも閉鎖
  できるものは再現しない（research.md §6 の O1〜O3）
- **2 人の会話は 2 人にしか見えない。** 原作と同じく、ログは入室者の認証がないと読めない。既存の `chats` テーブル
  （誰でも読める公開ログ）には書かない。新しい Guest に前の会話は渡さない。Q4(b) を採用したので、
  通報対応用の控えを管理者だけが確認できることを利用者に明示する

`/chat/2shot/` には現在、「歴史的チャット」の通常の部屋「２ショットチャット」がある。本 spec でこの URL をツーショット
チャットに置き換える。

調査の詳細（画面の構成、文言、状態遷移、原作の不具合）は [research.md](./research.md) にまとめた。本書で
「research.md §N」「N1」「E1」「O1」と書いたものはそこを指す。

既存 spec との関係:

- [`react-2026-refactoring`](../react-2026-refactoring/requirements.md) の設計方針（Actions、外部ストア、純粋な
  レンダー、依存を増やさない）に従う。既存の Persistent_Store（R9）と入力値を扱う `useStoreBackedState` を利用する。
  Pointer Events 化（R10）と参加人数の RPC（R14）も実装済み（design.md「既存 spec との関係」）
- [`chanari-retro-chat-ui`](../chanari-retro-chat-ui/requirements.md) と同じく、スコープを切った CSS で旧来の
  見た目を再現する。ただし本機能はログの部品（ChatLogList など）を再利用しない。ログの形が違うため

## Glossary

- **Legacy_2shot**: 原作の 2SHOT-CHAT v5.0.1
- **Oracle**: Legacy_2shot をローカルの Perl で動かした参照環境。受け入れ確認の「正解」を出す（research.md §2）
- **Two_Shot_Page**: 本機能のページ全体（`src/features/two-shot-chat/`）。`/chat/2shot/` で表示する
- **Frame_Layout**: 原作の `<frameset>` を再現する上下 2 ペインの配置と、その間の境界線（Frame_Border）
- **Lobby_Screen**: 入室前の画面。上ペインが Entry_Form、下ペインが Room_List（原作の `First`）
- **Room_Screen**: 入室後の画面。上ペインが Chat_Form、下ペインが Chat_Log_View（原作の `InForm`）
- **Entry_Form**: 入室フォーム（原作の `Form`）
- **Room_List**: 空室状況の一覧（原作の `List`）
- **Chat_Form**: 入室後の入力画面（原作の `ChatForm`）
- **Chat_Log_View**: 入室後のログ画面（原作の `Chat`）
- **Notice_Page**: 見出しと箇条書きのお知らせ画面（原作の `error`）。ページ全体か、下ペインに出る
- **Two_Shot_Room**: ツーショットの部屋 1 つ（既定は `01`〜`10` の 10 部屋）
- **Owner**: 管制者。部屋に最初に入った人（seat 0）
- **Guest**: 入室者。2 人目に入った人（seat 1）
- **Room_State**: 部屋 1 つぶんのサーバー上の状態（最終発言時刻、2 人ぶんの席、ログ）。原作の `ent` / `mes` / `log` に当たる
- **Session_Token**: 入室要求の前にブラウザが暗号論的乱数で作り、そのタブに保存する秘密の値。サーバーが入室を
  確定した時点で部屋と Member_ID に結びつく。未確定の値だけではログを読めない
- **Member_ID**: 入室ごとに新しく割り当てる内部識別子。席番号とは別で、発言者の判定に使う
- **Admission_Record**: 入室試行のトークンハッシュ、要求の指紋、結果を持つ非公開の再送判定用記録。秘密のトークン自体は持たない
- **Two_Shot_API**: Room_State を読み書きする唯一の経路（Supabase Edge Function `two-shot`）
- **Lobby_View**: 一覧に出してよい項目だけを anon に返す、読み取り専用の公開クエリ（design.md では SECURITY DEFINER
  の関数 `two_shot_lobby()` で作る）
- **Idle_Timer**: 無発言監視タイマ。最後の発言（または入室）から 300 秒で部屋を閉じる
- **Log_Size_Limit**: ログの容量の上限。互換用の概算で 5000 バイト（Unicode コードポイントごとに ASCII は 1、それ以外は 2）。
  実際の Shift_JIS エンコード長ではない。行の集計対象は design.md §6 で定義する
- **Max_Lines**: ログに残す行数。10
- **Auto_Refresh**: 画面の自動更新。Room_List は手動 / 60 秒、Chat_Log_View は なし / 20 秒 / 30 秒
- **Two_Shot_Config**: 原作の「初期設定」に当たる定数（名称、色、部屋、時間、上限）。research.md §4 の値を既定にする
- **Notice_Line**: ログに書かれる「おしらせ」の行（research.md §5.2 の N1〜N10）

## Requirements

優先度: **P0** = 原作と同じに動くために必須、**P1** = 必須だが後の PR でもよい、**P2** = 再現度を上げる任意の項目。

### Requirement 1: 設置とルーティング（P0）

**User Story:** 利用者として、トップの「２ショットチャット」から原作と同じツーショットチャットに入りたい。

#### Acceptance Criteria

1. WHEN `/chat/2shot/`（または末尾 `/` のない `/chat/2shot`）を開く, THE アプリ SHALL 通常のチャット画面（ChatRoute）ではなく
   Two_Shot_Page を表示する。部屋の URL の正は、ほかの部屋と同じく末尾 `/` 付きの形とする（GitHub Pages は
   `/chat/2shot` を `/chat/2shot/` へ 301 で転送する）。
2. THE Two_Shot_Page SHALL ちゃなりと同じく独立したルートのチャンク（`React.lazy`）として読み込まれる。
3. WHEN `/chanari/2shot/`（または `/chanari/2shot`）を開く, THE アプリ SHALL `/chat/2shot/` へリダイレクトする（ちゃなりの見た目で公開ログの
   部屋が開かないようにする）。
4. THE トップの「２ショットチャット」へのリンク SHALL 今の URL（`buildChatRoomPath` が作る `/chat/2shot/`）のまま
   Two_Shot_Page を開く。
5. WHEN 本番ビルドをする, THE プリレンダ SHALL `dist/chat/2shot/index.html` に Two_Shot_Page の Lobby_Screen を
   SSG で埋め、Two_Shot_Page のチャンクを modulePreload する（ChatRoute のチャンクや部屋紹介の静的な内容は出さない）。
6. THE サイトマップ SHALL `/chat/2shot/`（canonical と同じ末尾 `/` 付きの形）を今までどおり載せる。THE プリレンダ SHALL
   `/chanari/2shot/` を出力しない。
7. WHILE Two_Shot_Page を表示している, THE ページの背景色と `theme-color` SHALL `#FFFFFF` になる。
8. THE 既存の `chats` テーブルの `room_id = '2shot'` の行 SHALL 削除も変更もしない（Q7）。
9. THE Two_Shot_Page の canonical と og:url SHALL ほかの部屋と同じく `https://www.okiraku.chat/chat/2shot/`（`buildRoomSeo`
   の値）にし、プリレンダした head と hydrate 後の head を一致させる。

### Requirement 2: フレームの再現（P0）

**User Story:** 利用者として、原作と同じ「上下に分かれた画面」で使いたい。

#### Acceptance Criteria

1. THE Lobby_Screen SHALL 上を 245px に固定し、境界線を出さない（旧お気楽チャットの `rows="245,*" border=0`。Q1・Q10）。
   この境界は動かせない。
2. THE Room_Screen SHALL 画面を上 20%・下 80% に分け、間に Frame_Border を置く（原作の `rows="20%,80%"`）。
3. THE 各ペイン SHALL 独立してスクロールし、ページ全体はスクロールしない（フレームと同じ）。
4. THE Frame_Border SHALL 原作の `border=5 bordercolor=#555555` の frameset を Chromium で描いたものと同じ見た目になる
   （Oracle のスクリーンショットと比べる）。
5. WHEN Room_Screen の Frame_Border をポインターでドラッグする, THE Frame_Layout SHALL 上下のペインの高さを変える。THE Frame_Border
   SHALL キーボード（上下の矢印キー）でも動かせる（原作のフレームは境界を動かせた）。
6. THE Frame_Layout SHALL `<frameset>` や `<iframe>` を使わず、1 つの React のツリーで作る。
7. WHEN Lobby_Screen から Room_Screen に切り替わる（またはその逆）, THE Frame_Layout SHALL その画面の既定の比率に戻る。

### Requirement 3: 入室フォーム（P0）

**User Story:** 利用者として、名前・性別・部屋・プロフィールを入れて入室したい。

#### Acceptance Criteria

1. THE Entry_Form SHALL 旧お気楽チャットのアーカイブ（research.md §7）と同じ要素・順序・文言・色・入力欄の幅（`size`）で
   表示する: 13px のリンク「チャットならお気楽チャット」（`h1`）、19px の「ツーショットチャット」（`h2`）、ハンドルネーム
   （`size=10`）、性別 男 `#0099ff` / 女 `#ff0099`、部屋、`入室`、`保存`、待機用プロフィール（`size=50 maxlength=50`）。
2. THE 部屋のセレクト SHALL 先頭に値が空の `選択してください` を置き、`チャットルーム01`〜`チャットルーム12` をその後に並べる。
3. WHEN 保存された入力値がない, THE Entry_Form SHALL 性別に 男 を選ぶ。
4. THE Entry_Form SHALL 表示されたときにハンドルネームの欄にフォーカスする（保存値の有無によらない）。WHERE 保存された
   入力値がある, THE Entry_Form SHALL ハンドルネーム・性別・待機用プロフィールをその値で埋める。
5. WHEN `入室` を押す, THE Two_Shot_Page SHALL Requirement 5 の入室を行う。旧お気楽チャットに `開設` はないので、
   開設の印は付けない（空室に入れば待機中の Owner になる）。
6. WHEN 部屋を選ばずに入室する, THE Two_Shot_Page SHALL ページ全体に Notice_Page の E1 を出す。

### Requirement 4: 空室状況の一覧（P0）

**User Story:** 利用者として、どの部屋が空いていて、誰が待っているかを見たい。

#### Acceptance Criteria

1. THE Room_List SHALL 旧お気楽チャットのアーカイブ（research.md §7）の構成（更新の切り替え、「▼重要なお知らせ」、
   `border=2 cellpadding=5 cellspacing=1 bordercolor=#FF99CC width=700` の表、`チャットならお気楽チャットにもどる`、
   右寄せのクレジット）を同じ文言・色・罫線・配置で表示する。表の右の広告の枠（幅 200px）は、広告を出さずに空けておく。
2. THE Room_List SHALL 各部屋の状態を 空室 `#8888ff` / 待機中 `#00dd00` / 満室 `#ff0000` で出し、待機中のときだけ Owner の
   性別・ハンドルネーム・プロフィールを出す。接続元（ホスト名）は出さない（Q8、D21）。
3. WHEN `自動更新(60秒)にする` を押す, THE Room_List SHALL 表示を `〔60秒自動更新中〕〔手動更新にする〕` に変え、
   60 秒ごとに一覧を取り直す。WHEN `手動更新にする` を押す, THE Room_List SHALL 自動の取り直しをやめる。
4. WHEN `手動更新` を押す, THE Room_List SHALL 一覧を取り直す。
5. THE 一覧の取得 SHALL サーバーの状態を変えない。時間切れ（Idle_Timer 超過）の部屋は、書き込みをせずに 空室 として
   返す（O4 を再現しない）。
6. WHILE 最初の取得が終わっていない（SSG と hydration の直後を含む）, THE Room_List SHALL 部屋名だけを出し、状態などの
   欄を空にする（読み込み中の文言は出さない）。
7. IF 一覧の取得に失敗する, THEN THE Room_List SHALL 各行の状態以降の欄を原作のデータ異常の表示（`異常(2)`、4 列ぶん）に
   する。
8. THE `ホームページへ戻る` SHALL サイトのトップ（`BASE_URL`）へのリンクにする。
9. THE 著作表示 SHALL Q3 の決定に従い、原作と同じ位置（表の下の右寄せ）に小さな文字のクレジットとリンクで置く。

### Requirement 5: 入室（P0）

**User Story:** 利用者として、空いている部屋に入り、2 人目が入ったら部屋が閉じてほしい。

#### Acceptance Criteria

1. WHEN 空室の部屋に入室する, THE Two_Shot_API SHALL 前の会話を残さずに部屋を初期化し、入室者を Owner にし、
   N1（開設でも同じ）を書く。
2. WHEN 待機中の部屋に入室する, THE Two_Shot_API SHALL 入室者を Guest にし、N2 を書いて部屋を満室にする。
   WHERE 開設の印がある, THE Two_Shot_API SHALL N2 の代わりに N3 を書く。新規の Guest を確定する際は、
   それ以前のログを消してから N2 / N3・N4・N5 を書く。以前の Guest との会話を新しい Guest に渡さない。
3. WHEN 満室の部屋に入室する, THE Two_Shot_Page SHALL お知らせを出さずに Lobby_Screen に戻り、一覧を取り直す。
4. THE Two_Shot_API SHALL research.md §5.1 の匿名化の規則（空、または `,` `;` `:` `<` `>` を含む名前は `匿名`、
   Owner がいるときの `匿名` は `匿名2`、Owner と同じ名前は `匿名`）を適用し、適用したときは N5 を書く。
5. WHERE プロフィールが空でない, THE Two_Shot_API SHALL N4 を書く。書く順は N1〜N3 → N4 → N5 とする。
6. WHEN Owner と同じ IP アドレスかつ同じ UA の人が新規 Guest として入室しようとする, THE Two_Shot_API SHALL
   入室を拒否してページ全体に E2 を出し、既存の席・ログ・最終発言時刻を変えない。E2 の本文は
   `重複入室を検知しましたので、入室できません.` / `空室状況を確認してください.` とする（D16）。
   信頼できる IP を取得できない場合は一致と判定しない。確定済みの同一入室試行の再送は、この判定より先に処理する。
7. WHEN 新規入室が成功する, THE Two_Shot_API SHALL Idle_Timer を 0 に戻し、要求の Session_Token のハッシュを
   新しい Member_ID と席に結びつける。ブラウザは送信前にトークンと入室要求を保存する。
8. WHEN 2 人が同じ空室へほぼ同時に入室する, THE Two_Shot_API SHALL 片方だけを Owner にし、もう片方を Guest（または
   満室なら Requirement 5.3）として扱う。1 つの部屋に Owner が 2 人になることはない。
9. THE Two_Shot_API SHALL チャット名を 30 文字、プロフィールを 60 文字で切り詰める（フォームの `maxlength` を
   迂回した入力への備え）。
10. WHEN 入室の応答を受け取れず同じ試行を再送する, THE Two_Shot_API SHALL Admission_Record を参照し、
    現在も有効な同じ席なら現在の RoomView を返す。席・入室通知・Idle_Timer は増やしたり更新したりしない。
    既に失効した試行は E4 とし、再入室させない。同じトークンで別の部屋・入力値を送る要求は拒否する。
11. THE 新規入室試行 SHALL 作成から 10 分間だけ受け付ける（許容する未来時刻は 60 秒まで）。
    Admission_Record はトークン内の作成時刻から 24 時間保持し、削除後も期限切れのトークンで新規入室できない。
    この期限は、既に確定した席の通常の read / say の有効期間とは別とする。

### Requirement 6: 入力画面（P0）

**User Story:** 入室者として、発言・更新・退室の操作を原作と同じ画面でしたい。

#### Acceptance Criteria

1. THE Chat_Form SHALL research.md §3.3 の構成（部屋名と自分の名前・性別、ボタン、発言欄、自動更新のラジオ、注意書き
   2 行）を同じ文言・色・罫線で表示する。
2. WHERE 自分が Owner, THE Chat_Form SHALL `閉鎖` と `相手を退室` を出す。WHERE 自分が Guest, THE Chat_Form SHALL
   `退室` を出す。
3. WHEN `閉鎖` / `相手を退室` / `退室` を押す, THE Chat_Form SHALL 原作と同じ文言の確認ダイアログを出し、
   キャンセルされたら何もしない。
4. WHEN `発言` を押す（または Enter キー）, THE Chat_Form SHALL 発言を送り、発言欄にフォーカスを戻す。発言が保存されたら
   発言欄を空にする。送れなかったとき（お知らせが出たとき）は文字を残して全選択し、送り直せるようにする。応答を待つ間に
   書き足した文字は消さない（D20）。
5. WHEN `いつでも手動更新` を押す、または自動更新のラジオを選ぶ, THE Chat_Form SHALL 発言欄を空にし、その時点の
   自動更新の設定で Chat_Log_View を更新する（原作の `Reload()`）。
6. WHEN `相手を退室` を確認する, THE Chat_Form SHALL 自動更新を `なし` にする。
7. WHEN Room_Screen が表示される, THE Chat_Form SHALL 発言欄にフォーカスする。

### Requirement 7: ログ画面（P0）

**User Story:** 入室者として、相手とのやり取りを新しい順に読みたい。

#### Acceptance Criteria

1. THE Chat_Log_View SHALL ログを新しい順に、1 行ごとに `<hr>` で区切って表示する。
2. THE Chat_Log_View SHALL 自分の発言を `名前 > 発言 (HH:MM)` の全体を `#888888` で、それ以外（相手の発言と
   Notice_Line）を **名前** ` > 発言` と小さい文字の `(HH:MM)` で表示する。自分の発言は Member_ID で判定し、
   同じ席を以前使っていた人や同名の人の発言を自分の発言にしない。
3. THE Notice_Line SHALL research.md §5.2 の文言で表示し、性別は Two_Shot_Config の色で表示する。
4. THE 時刻 SHALL 日本時間の `HH:MM` で表示する。
5. THE Chat_Log_View SHALL ログの後に、Auto_Refresh の状態（`〔手動更新〕` / `〔N秒自動更新〕`）、
   `〔無発言監視タイマX秒経過→300秒後閉鎖〕`、`〔表示10行〕` を表示する。
6. THE `X` SHALL その表示を取得した時点の経過秒数とし、表示している間は変えない（原作と同じ）。
7. WHERE 自分が Owner, THE Chat_Log_View SHALL `画面クリア` ボタンを出す（O1 は再現しない。Q5）。
8. THE ログ SHALL 最新の Max_Lines 行だけを保持する（O5 は再現しない）。
9. THE 発言の本文 SHALL HTML として解釈しない（タグは文字のまま出る）。
10. WHERE 本文に HTML の文字参照（`&hearts;`、`&#9829;` など）がある, THE Chat_Log_View SHALL 対応する文字として
    表示する（O12。P2）。プロフィール（空室状況の一覧と、ログの「〜さんのプロフィール『 』」）も同じにする
    （原作はどちらも HTML にそのまま埋め込んでいた）。名前は `;` を含むと匿名になるので、文字参照は入らない。

### Requirement 8: 更新（P0）

**User Story:** 入室者として、原作と同じ感覚で画面を更新したい。

#### Acceptance Criteria

1. WHERE 自動更新が `なし`, THE Chat_Log_View SHALL 自分の操作（発言、`いつでも手動更新`、ラジオの選択、画面クリア、
   相手を退室）のときだけ新しい内容に変わる（Q2）。
2. WHERE 自動更新が 20 秒 / 30 秒, THE Chat_Log_View SHALL その間隔で内容を取り直す。
3. WHILE タブが非表示, THE 自動更新 SHALL 止まる。WHEN タブが再び表示される, THE 自動更新 SHALL すぐに 1 回取り直してから
   間隔を数え直す。
4. THE 更新 SHALL Idle_Timer を戻さない（O14 と同じ）。
5. WHEN ブラウザを再読み込みする, THE Two_Shot_Page SHALL そのタブの Session_Token が有効なら Room_Screen に戻す
   （原作の注意書き「更新ボタンは使わないでください」は表示したまま残す）。
   `sessionStorage` を使用できない場合はメモリに退避し、ページ内の利用は継続するが再読み込みからの復元は保証しない。
6. IF 再読み込み直後の取得が通信に失敗する, THE ページ SHALL 有効性未確認のトークンを消さず再試行できる。
   確定済み Session の表示用の名前・性別で上ペインを描き、下ペインに E12 を出す。未確定の入室試行は
   Lobby_Screen のページ全体のお知らせにし、同じ試行を再送する。表示用データは認可に使わない。
7. THE 非同期処理 SHALL 既に離れた Session の状態を変更しない。自動更新は操作の実行中に蓄積せず、
   退室・閉鎖・セッション失効のお知らせでは止まる。各通信にはタイムアウトを設ける。

### Requirement 9: 退室・相手を退室・閉鎖・画面クリア（P0）

**User Story:** 管制者として相手を退室させたり部屋を閉じたりし、入室者として自分だけ抜けたい。

#### Acceptance Criteria

1. WHEN Guest が退室する, THE Two_Shot_API SHALL N6 を書いて Guest の席を空け、部屋を待機中に戻す。THE 下ペイン SHALL
   Notice_Page の E7 になる。
2. WHEN Owner が相手を退室させる, THE Two_Shot_API SHALL Guest がいれば N8 を書いて席を空け、いなければ N7 を書く。
   THE 下ペイン SHALL 更新後の Chat_Log_View になる。
3. WHEN Owner が閉鎖する, THE Two_Shot_API SHALL 部屋を空室に戻す（ログと 2 人の情報を消す）。THE 下ペイン SHALL
   Notice_Page の E8 になる。
4. WHEN Guest の Session_Token で閉鎖を求める, THE Two_Shot_API SHALL N10（名前の欄は `管制者へおしらせ`）を書き、
   部屋は閉じない。THE 下ペイン SHALL Notice_Page の E9 になる。
5. WHEN Owner が画面クリアする, THE Two_Shot_API SHALL ログを N9 の 1 行だけにする。
6. WHEN 退室・閉鎖のあと, THE 上ペイン SHALL Chat_Form を出したままにする（原作と同じ。押すと Requirement 11 の
   お知らせになる）。
7. WHEN 退室させられた・閉鎖された・時間切れになった部屋の Session_Token で操作する, THE 下ペイン SHALL 原作と同じ
   お知らせになる。更新・発言・画面クリアでは E4、退室・相手を退室では E6、閉鎖では E9（その要求で時間切れを
   検知したときは E8）とする（design.md §6 の表）。

### Requirement 10: 無発言監視タイマとログの容量（P0）

**User Story:** 運営者として、放置された部屋が自動で空いてほしい。

#### Acceptance Criteria

1. WHEN 最後の発言（または入室）から Idle_Timer（300 秒）以上たった部屋を読み書きする, THE Two_Shot_API SHALL 認証の
   前にその部屋を空室に戻し、新規入室は続け、失効した同一入室試行の再送は E4 とし、それ以外の操作には Requirement 9.7 のお知らせを返す。
2. WHEN ログの容量が Log_Size_Limit を超えた部屋を読み書きする, THE Two_Shot_API SHALL 同じく部屋を空室に戻す
   （原作と同じく、超えた発言の次の操作で閉じる）。
3. THE Two_Shot_API SHALL 1 回の発言の長さを Log_Size_Limit 以下に制限する。
4. THE Lobby_View SHALL 時間切れの部屋を 空室 として返す（Requirement 4.5）。

### Requirement 11: お知らせ画面（P0）

**User Story:** 利用者として、操作の結果やエラーを原作と同じ画面で知りたい。

#### Acceptance Criteria

1. THE Notice_Page SHALL research.md §3.5 の構成（見出し、本文の箇条書き、`空室状況へ` / `ホームページへ戻る` /
   `直前の画面`）で表示する。
2. WHEN 入室で失敗する（E1、E2、試行失効 E4、通信失敗 E12）, THE Notice_Page SHALL フレームを含むページ全体に出る。WHEN 入室後の操作で結果や
   失敗が返る, THE Notice_Page SHALL 下ペインにだけ出て、上ペインはそのまま残る。
3. WHEN `空室状況へ` を押す, THE Two_Shot_Page SHALL Lobby_Screen に戻り、一覧を取り直す。
4. WHEN `直前の画面` を押す, THE Two_Shot_Page SHALL 直前のログ（ページ全体のお知らせなら入力値を保持した
   Lobby_Screen）に戻す。連続したお知らせで戻り先のログを上書きしない。復元失敗でログが一度もない場合は
   read を再試行する。失効後に過去のログへ戻してもセッションの有効性や自動更新は復活させない。
5. IF 通信やサーバーの障害で Two_Shot_API が応答しない, THEN THE Notice_Page SHALL 見出し `システムエラー`、本文
   `通信に失敗しました.` を出す（D14。E2 の変更は D16）。
6. THE Notice_Page SHALL E10（認証コードの発行失敗）を出さない。

### Requirement 12: 認証と不正対策（P0）

**User Story:** 入室者として、部外者に部屋を閉じられたり、相手に管制者の操作を奪われたりしたくない。

#### Acceptance Criteria

1. THE Session_Token SHALL ブラウザの `crypto.getRandomValues` による 256 ビットの乱数を含み、
   サーバーにはハッシュだけを保存する。形式は `v1.<作成時刻のUnixミリ秒>.<32バイトのbase64url>` とする。
   時刻を含むトークン全体をハッシュ化し、作成時刻を書き換えたものを同一試行として扱わない。
2. THE Session_Token SHALL サーバーで確定された部屋と Member_ID にだけ有効とする。THE Guest の Session_Token SHALL Owner の操作
   （閉鎖・相手を退室・画面クリア）に使えない（O3 を再現しない）。
3. THE Two_Shot_API SHALL 既存の席と一致しないトークンで部屋を閉鎖・消去・操作しない（O2 を再現しない）。
   例外は Idle_Timer / Log_Size_Limit の正規化と、新規入室の検証を通った `enter` だけとする。
   拒否された入室（E2・満室など）では、正規化以外の Room_State の変更をしない。
4. IF Session_Token なしでログを読もうとする, THEN THE Two_Shot_API SHALL E3 を返し、時間切れ・容量超過の正規化以外で部屋は変えない。
5. THE Session_Token SHALL URL に載せず、そのタブの `sessionStorage` に置いてリクエストのヘッダで送る。
   独立した保存領域から開始する別タブは別の利用者として扱う。ブラウザのタブ複製等で同じトークンが
   引き継がれた場合は同じ利用者であり、別人としての分離を保証しない。
6. THE Two_Shot_API SHALL 入室本文の IP / UA を信用せず、サーバーが受信したヘッダを使う。IP はデプロイ先の
   信頼できるプロキシが確定した値に限る。UA と IP の一致は重複入室の補助判定であり、認証には使わない。
7. THE ログ・トークン・ハッシュ・プロフィール SHALL トレースやエラーログに含めない。API 応答は `Cache-Control: no-store` とする。

### Requirement 13: 入力値の保存（P1）

**User Story:** 利用者として、次に来たときに名前などを入れ直したくない。

#### Acceptance Criteria

1. WHEN `保存` にチェックを入れて入室する, THE Two_Shot_Page SHALL チャット名・性別・プロフィールをブラウザに保存する。
2. WHEN `保存` のチェックを外して入室する, THE Two_Shot_Page SHALL 保存していた値を消す。
3. THE 保存先 SHALL `localStorage` とし、SSG と hydration の間は保存値のない状態で描く（hydration の不一致を起こさない）。
4. THE 保存する値 SHALL 通常のチャットやちゃなりの設定とは別のキーにする。

### Requirement 14: サーバーとデータ（P0）

**User Story:** 開発者として、2 人の状態を安全に、同時に操作されても壊れない形で持ちたい。

#### Acceptance Criteria

1. THE Room_State SHALL Supabase の専用テーブルに部屋ごと 1 行で持ち、入室・発言・退室などの変更は 1 行の原子的な
   更新で行う（同時の要求で状態が混ざらない）。状態の CAS、Admission_Record の確定、Q4(b) を採用した場合の
   監査記録は、service_role 専用 RPC の同一トランザクションで行う。一部だけの保存は認めない。
2. THE anon / authenticated ロール SHALL Room_State・Admission_Record・監査テーブルを直接読み書きできず、
   状態を保存する RPC も実行できない。読み書きは Two_Shot_API（service_role）だけが行う。
3. THE Lobby_View SHALL 部屋の ID・状態・（待機中のときだけ）Owner の性別・チャット名・プロフィールだけを anon に
   公開する。IP アドレス、UA、Session_Token のハッシュ、ログ、Guest の情報は公開しない。
4. THE 部屋の ID SHALL `rules.ts` を唯一の定義とし、表示名は Two_Shot_Config に置く。
   DB の行はマイグレーションで同じ ID を用意し、三者の一致を検証する。
5. THE マイグレーション SHALL 既存の migration と同じく、適用時に自己検証（ビューが公開する列、権限）を行う。
6. THE Two_Shot_API SHALL 既存の save-chat と同じく、CORS・JSON の検証・New Relic のトレースに対応する。

### Requirement 15: プライバシー（P0）

**User Story:** 入室者として、2 人の会話を他人に読まれたくない。

#### Acceptance Criteria

1. THE ツーショットのログ SHALL その部屋の Owner と Guest の Session_Token でしか読めない。
   新規 Guest の入室前にあったログは、その Guest に返さない。Q4(b) の管理者用の控えは別の保存先とする。
2. THE ツーショットのログ SHALL `chats` テーブル、全部屋まとめ、ランキング、トップの参加人数の集計に入らない。
3. THE IP アドレスと UA SHALL その席が空くか部屋が空室に戻った時点で Room_State から消える。
4. THE `2shot` の部屋紹介文（`rooms.ts`）SHALL 「発言は公開ログとして誰でも読める」という今の説明を、2 人だけの
   会話であることと、個人情報や出会い目的の書き込みへの注意に書き換える。
5. THE サーバーでの会話の保存（通報への対応用）SHALL Q4(b) の決定に従って行う。発言の確定と
   控えの保存を原子的に行い、30 日以上経過した記録を毎時削除する（物理削除までの最大遅延は 1 時間）。
   管理者の参照も 30 日未満に限定し、削除ジョブの失敗を検知する。紹介文・注意書きに保持期間と物理削除の最大遅延を明記する。

### Requirement 16: 既存機能との整合（P1）

**User Story:** 利用者として、トップやほかの画面からも自然にツーショットチャットを使いたい。

#### Acceptance Criteria

1. THE トップの「２ショットチャット」の参加人数 SHALL `chats` の発言者数ではなく、ツーショットの全部屋で席に着いている
   人数の合計にする（Lobby_View から数える）。既存の参加人数 RPC とその 404 フォールバックのどちらでも
   `chats` の `2shot` を除外する。一方の API が失敗しても他方の人数は保持する。
2. THE 通常のチャット画面の関連部屋リンク（歴史的チャット）SHALL `/chat/2shot/` を指したままにする。
3. THE CLAUDE.md SHALL 本機能（ディレクトリ、Edge Function、テーブル、ログを公開しない方針）を追記する。

### Requirement 17: 2026 年の React の設計に合わせる（P0）

**User Story:** 開発者として、原作の CGI の作りを持ち込まず、今の React の型で保守したい。

#### Acceptance Criteria

1. THE サーバーの状態を変える操作（入室、発言、更新、退室、閉鎖、画面クリア）SHALL React 19 の Actions（`<form action>`
   または `startTransition` の中の async 関数）で行い、結果は Action の戻り値として画面の状態に反映する。
2. THE 取得や購読 SHALL Effect の依存配列で制御せず、外部ストアを `useSyncExternalStore` で読む。THE 外部ストア SHALL
   `getServerSnapshot` を持ち、SSG では Lobby_Screen の初期状態を返す。
3. THE レンダー SHALL 純粋に保つ。現在時刻に依存する値（経過秒数）はサーバーの応答から受け取り、レンダー中に
   `Date.now()` を呼ばない。
4. THE Two_Shot_Page SHALL `useMemo` / `useCallback` / `memo` を新しく書かない。THE Compiler_Check SHALL 本機能の
   ファイルを許可リストなしで通す。
5. THE Two_Shot_Page のチャンク SHALL `@supabase/supabase-js` と分割済みの functions-js / postgrest-js / realtime-js を読み込まない
   （`fetch` で Two_Shot_API と Lobby_View を呼ぶ）。`/chat/2shot/` の modulePreload に `vendor-supabase` が含まれない。
6. THE 見た目 SHALL `dangerouslySetInnerHTML` を使わずに作る。入力欄の `size` / `maxLength` は属性のまま使う。
   表の `border` / `cellpadding` / `cellspacing` と、`<font>` / `<center>` / `bgcolor` などの廃止された要素・属性は、
   ブラウザが描く値と同じ CSS で置き換える（表の属性の効果はスコープのリセットで消えるため。design.md §5）。
7. THE スタイル SHALL Two_Shot_Page の外に波及させない（スコープを切った CSS）。スコープの中ではサイト共通の
   リセット（Tailwind の preflight）を打ち消し、原作と同じブラウザ既定の見た目に戻す。
8. THE Two_Shot_Page SHALL 型情報を使う lint（`no-floating-promises` など）を違反なしで通す。
9. THE 画面に見える要素 SHALL 原作から増やさない。支援技術のための情報（入力欄のラベル、境界線の `role="separator"`
   など）は見た目を変えない形（`aria-label` など）で足す。

### Requirement 18: 検証（P0）

**User Story:** 開発者として、「原作と同じ」をテストと目視の両方で確かめたい。

#### Acceptance Criteria

1. THE 受け入れ確認 SHALL design.md「テスト戦略」に挙げた画面の状態ごとに、Oracle の出力を Chromium で描いたものと
   本機能の画面を同じ大きさで並べて比べ、明示した意図的な差分以外に違いがないこと（フォントの描画差を除く）を PR に記録する。
2. THE Room_State の状態遷移 SHALL 純粋な関数として書き、プロパティベースのテスト（fast-check）で不変条件
   （席は 2 つまで、Guest がいれば Owner もいる、ログは Max_Lines 行以下、時間切れの部屋は空室として扱う）を確かめる。
3. THE Two_Shot_API SHALL research.md §5.2 と §5.3 の文言が出る場面を、意図的な変更（特に E2 / E12）を反映して
   テストで確かめる。入室応答の喪失と再送、失効した試行の再送、監査の INSERT 失敗によるロールバックを含める。
4. THE 各画面 SHALL Storybook のストーリーを持ち、Chromatic のベースラインに入る。
5. THE テスト SHALL 日本語の名前で書き、カバレッジの下限（50%）を守る。
6. THE 本機能の CI SHALL Vitest・Deno・実 DB の統合テストを実行し、失敗を許容しない。
   既存 CI の Deno 未実行や `continue-on-error` を本機能の検証保証として使わない。

## Non-Goals

- 原作にない機能の追加（通知音、アバター、ランキング、既読、画像、3 人以上の部屋）
- スマートフォン向けの配置の組み替え。原作と同じく、狭い画面ではペインの中を横にスクロールする
- 原作の「ホスト名の告示」（HTML コメントへのホスト名の出力）の再現。IP アドレスは画面にもソースにも出さない
- 原作の `<noframes>` の文言、広告
- 原作の文字コード（Shift_JIS）の扱い。容量の計算は D19 の概算規則にする
- ブラウザの戻る・進むボタンでペインの表示を行き来すること（`直前の画面` で代える）
- 通報フォームやモデレーション画面の新設（Q4 の範囲を除く）
- `chats` の `room_id = '2shot'` の過去ログを新しい画面で見せること

## 原作との意図的な違い

見た目は同じにしたうえで、次の点だけ振る舞いを変える。

| #   | 原作                                        | 本機能                                                            | 理由                                               |
| --- | ------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| D1  | `<frameset>` と別々の文書                   | 1 つのページの上下ペイン（見た目は同じ）                          | frameset は現在の HTML にない。SSG と共存させる    |
| D2  | 認証コード（8 文字）を URL に載せる         | Session_Token（256 ビット乱数）を `sessionStorage` とヘッダで扱う | O3、URL からの漏えい                               |
| D3  | cookie に入力値を保存                       | `localStorage`                                                    | サイトの他の設定と揃える                           |
| D4  | 管制者に画面クリアが出ない（O1）            | 出す                                                              | 原作の意図どおりにする（Q5）                       |
| D5  | 認証なしで閉鎖・画面クリアできる（O2）      | できない                                                          | 不正対策                                           |
| D6  | 一覧の表示が部屋を空室に戻す（O4）          | 表示は読むだけ                                                    | 読み取りに副作用を持たせない                       |
| D7  | 入室直後は 10 行を超えうる（O5）            | 常に 10 行まで                                                    | 単純にする                                         |
| D8  | 自分の発言かどうかを名前で判定              | 入室ごとの Member_ID で判定する（お知らせは常に相手側の書式）     | 名前を「おしらせ」にした場合の誤判定をなくす       |
| D9  | 入室の競合で管制者が 2 人になりうる         | 原子的に判定する（注意書きの文言は残す）                          | 状態を壊さない                                     |
| D10 | ブラウザの再読み込みで部屋を離れる          | 同じタブなら部屋に戻る                                            | 実害をなくす（注意書きは残す）                     |
| D11 | 閉鎖の不正検知（N10）は誰の要求でも書く     | 有効な Guest の Session_Token のときだけ書く                      | 部外者がログに書き込めないようにする               |
| D12 | `直前の画面` はブラウザの履歴を戻る         | ペインの直前の表示に戻す                                          | 1 ページのアプリで履歴を戻るとサイトから出てしまう |
| D13 | 非表示のタブでも自動更新する                | 非表示の間は止め、表示されたら取り直す                            | 無駄な通信をなくす（見える結果は同じ）             |
| D14 | 通信の失敗は想定しない                      | `システムエラー` のお知らせを出す                                 | Web API を使うため                                 |
| D15 | 著作表示の画像（CGI-RESCUE）                | 文字のクレジット（Q3）                                            | 原作のコードを使わない再実装のため                 |
| D16 | 同じ IP / UA の重複入室で部屋を消す         | 入室だけを拒否し E2 の本文を変更する                              | 認証なしの閉鎖を防ぐ                               |
| D17 | 入室の応答で認証コードを初めて受け取る      | 送信前に秘密のトークンを保存し同じ試行を再送する                  | 応答喪失から復帰する                               |
| D18 | 新しい入室者にも既存ログを渡す              | 新規 Guest の入室確定時に既存ログを消す                           | 前の 2 人の会話を第三者に渡さない                  |
| D19 | 保存ファイルの Shift_JIS バイト長で容量制限 | 表示名・本文・時刻・区切りをコードポイント単位の概算で数える      | JSON と装飾 HTML の差を明示し、計算を一意にする    |
| D20 | 発言の後も文字を残して全選択する            | 保存されたら発言欄を空にする（送れなかったら残す）                | Enter のたびに同じ発言を連投してしまう             |
| D21 | 待機中の人の接続元（ホスト名）を一覧に出す  | 出さない（行の高さは同じ）                                        | 個人情報（Q8）                                     |
| D22 | 通報フォーム・広告・PHP 移植のクレジット    | 管理者チャットへ案内、広告の枠は空ける、原作の文字のクレジット    | 今のサイトにないもの・事実と違うものを出さない     |

## 決定事項（2026-09-24）

Q1〜Q7 は推奨どおりに決定した。本書の要件は、この決定を前提に読む。

- **Q1: 見た目の基準 → v5.0.1 の配布版。** 提供されたソースがあり、全画面を Oracle で確かめられる。色・部屋・文言は
  Two_Shot_Config に集め、旧お気楽チャット（research.md §7）に寄せたくなったら設定で変えられるようにする
- **Q2: 更新の方式 → 原作どおり**（自分の操作か、20 / 30 秒ごと。Requirement 8.1）。Realtime は使わず、このルートでは
  Supabase の SDK を読み込まない（Requirement 17.5）
- **Q3: 著作表示 → 画像は使わない。** 同じ位置（一覧の表の下の右寄せ）に小さな文字で「原作: 2SHOT-CHAT (CGI-RESCUE)」と
  リンクを出す。原作はライセンスフリーだが、本機能は原作のコードを使わない再実装なので「製作/著作」の画像は事実と違う
- **Q4: 安全面 → (a) と (b) の両方を採る。** (a) 旧お気楽チャットと同じ位置と文言で注意書きを出す（通報先はサイトの
  管理者チャット）。(b) 会話の控えを service_role だけが読める `two_shot_audit` に 30 日保存し、通報があったときだけ
  確認する。注意書きと紹介文に、控えの保存・保持期間・物理削除の最大遅延を書く（Requirement 15.5）
- **Q5: 画面クリアのボタン（O1）→ 管制者に出す**（D4）
- **Q6: 部屋の数と名前 → ルーム１〜ルーム１０**
- **Q7: 既存の「２ショットチャット」の過去ログ → 消さずに残す**（Requirement 1.8）。全部屋まとめなどで見える状態も
  今のままにする

原作のソース（`2shot.cgi`、`jcode.pl`）と著作表示の画像は、ライセンスフリーだが本機能に不要なのでリポジトリに入れない。
Oracle はリポジトリの外に置く。

### 追記: 見た目を旧お気楽チャットの待合室に合わせる（2026-09-24）

ユーザーの依頼で、Q1 と Q6 を次のとおり変更し、Q8〜Q10 を決めた。

- **Q1（変更）: 見た目の基準 → 待合室（入室フォームと空室状況）は旧お気楽チャットのアーカイブ**（research.md §7。
  `2shot.php` の `?action=Form` / `?action=List` の HTML）に忠実に合わせる。入室後の画面はアーカイブがないので
  v5.0.1 の構成のまま、色・罫線・文言を待合室に合わせる（トンマナを揃える）。動き（状態遷移・お知らせ）は v5.0.1 のまま
- **Q6（変更）: 部屋 → チャットルーム01〜12 の 12 部屋**（DB に部屋 11・12 を足し、Edge Function を再デプロイする）
- **Q8: 待機中の人の接続元（ホスト名）→ 出さない。** アーカイブではプロフィール欄にホスト名が出ていたが、個人情報なので
  出さない。行の高さは同じにする（D21）
- **Q9: 通報の案内 → 管理者チャット。** 旧サイトの通報フォームに当たるものがないので、文はアーカイブのまま、リンク先と
  文字を管理者チャットにする（D22）
- **Q10: 入室後の画面の境界線 → 残す。** 待合室はアーカイブどおり境界線なしで上 245px に固定し、入室後の画面は今の
  境界線（ドラッグで高さを変えられる）を残す

## Success Metrics

| 指標                                                                         | 目標                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------- |
| Oracle と見比べて違いがある画面の状態（design.md のテスト戦略の一覧）        | 0（フォントの描画差・明示した意図的な差分を除く） |
| research.md §5.2 / §5.3 の文言のうちテストで確かめたもの                     | E10 と E12 を除く全件                             |
| 未認証の操作・拒否した入室で正規化以外に部屋やログが変わる経路（O2、O3）     | 0                                                 |
| `/chat/2shot/` の modulePreload に含まれる `vendor-supabase`                 | なし                                              |
| Two_Shot_Page のルートチャンク（gzip）                                       | 15 kB 以下                                        |
| React Compiler で未コンパイルの関数（本機能）                                | 0                                                 |
| 入室から Room_Screen が操作できるまで（Two_Shot_API の p95、東京リージョン） | 1 秒以内                                          |
