# Web フロントエンドからサーバーへ移すロジック（リファクタリング計画）

最終更新: 2026-10-11（実施の結果を追記）。計画の対象: `main`（`14af9c4`、2026-09-28）。

Web フロントエンド（`src/`）が持っているロジックのうち、クライアントに置くべきでないものを洗い出す。そのうえで、
テーブル（制約・表・RLS）や Function（SQL 関数・既存の Edge Function）へ移しても**利用者が感じる速さを落とさない**
ものについて、移し方・性能の根拠・移行の順序をまとめる。

関連: [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)、[`docs/save-chat-edge-function.md`](./save-chat-edge-function.md)、
[`.kiro/specs/android-native-app/`](../.kiro/specs/android-native-app/)（Android 版はサーバー側の規則について本書を正とする）。

## 実施の結果（2026-10-11）

Issue #175〜#188 を stacked PR #189〜#202 で実装し、PR #203（`0ee4a0f`、2026-10-10 マージ）で `main` に入った。
サービスを閉塞している間に DB・Function・Web をまとめて配信する前提にしたため、§9 の「足す → Web を切り替える →
締める」の段階と「記録だけ」の期間は持たず、最初から締めた形で入れた（`63a3b0a`）。配信の手順は
[`docs/save-chat-edge-function.md`](./save-chat-edge-function.md) §9。

**以下 §1〜§12 は計画の時点の記録として残す。実装と違うところは、この節と表を正とする。**

| ID  | 状態                                           | 実装（計画との違い）                                                                                                                                                                                                                      |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | 済（#191）                                     | `schema.ts`。最初から拒否する（記録だけのモードは無い）。CHECK は `NOT VALID`                                                                                                                                                             |
| S2  | 済（#192）                                     | metadata は `version`・`fontStyle`・`avatar`・`optimisticNonce` だけに作り直す。拒否はせず、落としたものを記録する                                                                                                                        |
| S3  | 済（#201）                                     | 利用者の発言は常に `system: false`。予約名「管理人」「巫女」は NFKC + 空白・見えない文字を除いて比べて拒否（`reserved_name`）                                                                                                             |
| S4  | 済（#193）                                     | `rooms(id, category, triage)`。**`enabled` は持たない**（閉じる部屋が無いため）。外部キーは `NOT VALID`、違反は `400 invalid_room_id`。`rooms` は anon が読める                                                                           |
| S5  | 済（#195）                                     | `op: enter / exit`。`nonce` は本文の最上位で送る。`messages.ts` の `buildAdminChat`                                                                                                                                                       |
| S6  | 済（#196）                                     | 巫女の返事は応答の `extra`。運勢は `messages.ts`。`fortuneBot.ts` は削除                                                                                                                                                                  |
| S7  | 済（#194・#202）                               | `insert_chat(p_chats, p_author_key, p_operation_id)`。**送信操作の ID で冪等**（`chat_operations`、24 時間で pg_cron が消す。計画に無かった追加）。`clear_my_chats` は**消した uuid の配列**を返す（計画は件数）。anon の UPDATE は閉じた |
| S8  | 済（#198）                                     | `chats-postgres-<room>` の INSERT から鳴らす。broadcast の channel は無い                                                                                                                                                                 |
| S9  | 済（#197）                                     | `metadata.event` / `subject`。構造の無い古い行だけ正規表現で読む                                                                                                                                                                          |
| S10 | **行わない**（2026-10-11 に D1 = 案 B と決定） | Issue #185 は実装なしで閉じていた。`public-select` は `USING (true)` のまま（削除済みの発言は API から読める）。[消す] の説明を「表示から消す（内容はサーバーに残る）」にそろえる                                                         |
| §7  | 済（#187・#188）                               | 人数のクライアント集計と mock のログを削除（D3 は「消す」に決定）                                                                                                                                                                         |
| —   | 済（#190）                                     | anon の Realtime の INSERT に `ip` は届かない（実測。CI で毎回確かめる）                                                                                                                                                                  |
| P10 | 一部                                           | `CLAUDE.md`・`save-chat-edge-function.md` §9 は更新済み。`docs/ARCHITECTURE.md` §7・§12 は未更新                                                                                                                                          |

決めたこと: D2 = 移行前の発言は `clear` で消せない。D3 = mock を消す。D4 = 「管理人」「巫女」。D5 = 120 grapheme
（コードポイントでも 2000 以内）。D1 = 案 B（隠さない、2026-10-11）。退室の偽装は受け入れる（2026-10-11）。

残り:

- CHECK 制約（`chats_*_check`）と外部キー（`chats_room_id_fkey`）の `VALIDATE`（本番の既存行の違反を数えてから）
- [消す] の説明の文言を D1 = 案 B に合わせる（Android spec の Task 0.4）
- §8 の性能の確かめ（`POST save-chat` と clear の p95、2 つのブラウザでの look の到達時間）は本番の配信の後
- `20261006030000_insert_chat_and_clear_my_chats.sql` のコメントにある「トリガー `chats_room_enabled`（YC001）」は
  `63a3b0a` で外した仕組みの名残（適用済みのマイグレーションなので直さない）

## 0. 結論

| ID  | ロジック                                   | 判定           | 移し先                                               | 往復（前 → 後） | 性能                                                      |
| --- | ------------------------------------------ | -------------- | ---------------------------------------------------- | --------------- | --------------------------------------------------------- |
| S1  | 入力の上限と形式（名前・発言・色・メール） | 移す           | `save-chat` の検証 + CHECK 制約                      | 1 → 1           | 検証は µs 単位。追加の往復なし                            |
| S2  | `metadata` の形                            | 移す           | `save-chat` の許可リスト + CHECK 制約                | 1 → 1           | 同上                                                      |
| S3  | `system` フラグと予約名（管理人・巫女）    | 移す           | `save-chat`                                          | 1 → 1           | 同上                                                      |
| S4  | 部屋 ID の正当性                           | 移す           | `rooms` 表 + 外部キー                                | 1 → 1           | 挿入ごとに 82 行の表の主キーを 1 回引くだけ               |
| S5  | 入退室の管理人の発言                       | 移す           | `save-chat` の `op`                                  | 1 → 1           | 文字列の組み立てだけ                                      |
| S6  | おみくじ（巫女の返事）                     | 移す           | `save-chat` の `op`（1 回の要求で 2 行を保存）       | **2 → 1**       | **速くなる**                                              |
| S7  | `clear`（自分の発言の消去）                | 移す           | SQL 関数（RPC）+ 書いた端末の照合                    | 1 → 1           | Edge を通さないのでコールドスタートなし                   |
| S8  | `look` / `unlook` の通知                   | 移す           | Broadcast をやめ、保存された発言（INSERT）から鳴らす | —               | **部屋ごとの channel が 2 → 1**。受け手には同じか早く届く |
| S9  | 入退室の判定の手がかり                     | 移す           | サーバーが `metadata` に構造で書く                   | —               | 正規表現の評価が減るだけ                                  |
| S10 | 論理削除した発言を誰に見せるか             | 決めてから移す | RLS + ビュー                                         | 1 → 1           | 部屋のログは今と同じ実行計画                              |
| —   | 人数のクライアント集計（5000 行）          | 消す           | —                                                    | —               | 使われていない経路（§7）                                  |
| —   | オフライン時の mock のログ                 | 決めてから消す | —                                                    | —               | §7                                                        |
| —   | 楽観的表示、ログの並び、参加者の算出ほか   | 残す           | —                                                    | —               | 移すと往復が増えるか、表示の関心（§6）                    |

移行はすべて「サーバーに足す → Web を切り替える → サーバーで締める」の順に行い、締める前に性能と拒否の件数を
確かめる（§8・§9）。

## 1. 目的

- **クライアントで決めている規則は守られていない。** anon key は Web の bundle に入った公開値で、PostgREST・
  Edge Function・Realtime には誰でも直接つなげる。Web の画面で上限や形を確かめても、画面を通らない要求には効かない
- **同じ規則を二重に書かない。** Android 版（`.kiro/specs/android-native-app/`）を作ると、クライアントに残した規則は
  Kotlin にも書くことになる
- **速さを落とさない。** 移す条件は「発言・入室・ログの表示・通知の速さが今と同じか速い」こと。遅くなるものは移さない

## 2. 判定の基準

### 2.1 フロントエンドに置かないもの

- **A 信頼**: ほかの利用者が見るもの・数えるものを、送り手のクライアントが決めている（管理人を名乗る、他人の発言を消す、
  全員の通知音を鳴らす）
- **B 一貫**: 複数のクライアント（Web・Android・将来の bot）が同じ答えを出す必要がある（入退室の文言、運勢、入力の上限）
- **C 完全**: 手元に全部のデータが無いと正しく出せない（手元のログで数える集計、手元のログで決める削除の対象）

### 2.2 フロントエンドに残すもの

- 表示と操作（整形、リンク、入力の補助、即時の反映）
- Realtime で手元に届いたデータから作れるもの（サーバーに移すと問い合わせが増える）
- GA のセッションと結び付くクライアントの計測

### 2.3 移し先の選び方（速い順）

1. **制約**（CHECK・外部キー）: 挿入の中で評価される。追加の往復なし
2. **生成列・既定値**: 今の `ip_masked`・`time`・`uuid` と同じ
3. **既にクリティカルパスにある `save-chat` の中**: 追加の往復なし。Edge から DB への書き込みは 1 回の RPC にまとめ、
   Edge → DB の往復も増やさない
4. **SQL 関数（PostgREST の RPC）**: ブラウザからの往復 1 回。コールドスタートなし
5. **新しい Edge Function**: 往復 1 回にコールドスタートが加わりうる。**本書では作らない**

### 2.4 性能の物差し

クリティカルパス上のブラウザ → Supabase の往復数、コールドスタートの有無、DB の実行計画（インデックスを使うか、何行を
読むか）、転送量、Realtime の channel 数と受け手に届くまでの時間。

## 3. 現状（コードで確かめたこと）

### 3.1 `save-chat` が確かめていること・いないこと

| 項目       | クライアント（Web）                                              | `save-chat`（`handler.ts`） | DB（`chats`）                           |
| ---------- | ---------------------------------------------------------------- | --------------------------- | --------------------------------------- |
| `room_id`  | `rooms.ts` の 82 ID から選ぶ                                     | 空でない文字列              | `text NOT NULL`（既定 `superbeginner`） |
| `name`     | 必須・24 文字（`validation.ts`、`maxLength`）                    | 空でない文字列              | `NOT NULL`                              |
| `message`  | 120 文字（`maxLength`。ちゃなりは `countChars` で 120 grapheme） | 空白だけでない              | `NOT NULL`                              |
| `color`    | 12 文字（`maxLength`）                                           | 文字列なら何でも            | `NOT NULL`                              |
| `email`    | 64 文字（`maxLength`）                                           | 文字列なら何でも            | —                                       |
| `system`   | 管理人・巫女のときだけ `true`                                    | boolean ならそのまま保存    | 既定 `false`                            |
| `metadata` | `normalizeChatMetadata` が**読むときに**知らない値を捨てる       | 何でもそのまま保存          | `jsonb`                                 |
| 名前       | 「管理人」「巫女」は画面が作る発言だけが使う                     | 確かめない                  | —                                       |

`docs/ARCHITECTURE.md` §12 の「名前必須・24文字以内などをEdgeでも検証」は実装と合っていない（24 文字は確かめて
いない）。P10 で直す。

### 3.2 anon key で誰でも直接できること

- `save-chat` に任意の JSON を送る。上の表のとおりほぼ何でも保存されるので、`metadata.kind: "admin"` と
  `system: true` で管理人を名乗る、任意の `room_id` に書く、大きな `metadata` を送る、ができる
- PostgREST で `chats` の**論理削除した行・`email`・`ua`** を読む（`public-select` は `USING (true)`。列の権限は `ip`
  だけを外している）。全部屋まとめで `email` / `ua` を選ばないのは画面の都合で、隠せてはいない
- PostgREST で `deleted = true` に更新する（`public-update` + `UPDATE (deleted)`）。条件はクライアントが決めるので、
  他人の名前の発言も、全部屋の発言も消せる
- Realtime の broadcast `chats-broadcast-<room>` に `look` を送る。発言せずに、部屋にいる全員の通知音を鳴らせる

### 3.3 クライアントの規則に依存しているサーバー側の集計

`chat_ranking` ビューと `room_participant_counts` は `system IS NOT TRUE` と `metadata->>'kind' <> 'admin'` で管理人の
発言を除いている。どちらもクライアントが送った値なので、集計の正しさがクライアントに依存している（S3 で解消する）。

## 4. 棚卸し

`src/` のロジックを 1 つずつ見た結果。A〜C は §2.1 の基準。

| #   | ロジック                                         | 場所                                                                      | 基準 | 判定                               |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------- | ---- | ---------------------------------- |
| L1  | 名前・発言・色・メールの上限                     | `validation.ts`、`EntryForm` / `ChatRoom` の `maxLength`、`countChars.ts` | A B  | 移す（S1）                         |
| L2  | `metadata` の許可リスト                          | `normalizeMetadata.ts`、`ChatRoom.buildMetadata`                          | A B  | 移す（S2）                         |
| L3  | `system` の値、管理人・巫女の名前                | `createAdminChat`、`sendFortuneIfCommand`                                 | A    | 移す（S3）                         |
| L4  | 部屋 ID の一覧と有効・無効                       | `rooms.ts`（`isRoomId`、`enabled`）                                       | A B  | 移す（S4）                         |
| L5  | 入退室の管理人の発言（文言・metadata）           | `useChatSession.enter` / `exit`、`createAdminChat`                        | A B  | 移す（S5）                         |
| L6  | おみくじの判定と運勢 12 通り                     | `fortuneBot.ts`、`useChatSender.sendFortuneIfCommand`                     | A B  | 移す（S6）                         |
| L7  | `clear` の対象（名前・部屋）                     | `clearChatLogsByName`、`isClearTarget`                                    | A C  | 移す（S7）                         |
| L8  | `look` / `unlook` の通知                         | `broadcastLookEvent`、`onLookBroadcast`、`useLookSound`                   | A    | 移す（S8）                         |
| L9  | 入退室の発言から参加者を読む正規表現             | `useParticipants.ts`、`ChatMessage.splitAdminMessage`                     | B    | 手がかりを移す（S9）               |
| L10 | 論理削除した発言・`email` / `ua` を出すか        | `chatQueries.ts`（`deleted` の条件、`SELECT_COLUMNS`）                    | A    | 決めてから移す（S10）              |
| L11 | 人数のクライアント集計（最大 5000 行）           | `roomCountsApi.fetchCountsFromRows`                                       | C    | 消す（§7）                         |
| L12 | オフライン時の mock のログとランキング           | `fallback.ts`、`aggregateChatRanking`                                     | —    | 決めてから消す（§7）               |
| L13 | 全部屋まとめの「削除対象の発言がありません」     | `useChatSession.sendMessage`（手元のログで判定）                          | C    | S7 の戻り値で置き換える            |
| L14 | 楽観的表示と確定値の突き合わせ                   | `optimisticLog.ts`、`useChatSender`                                       | —    | 残す（§6）                         |
| L15 | ログの合流と並び（二分探索、2000 件）            | `aggregatedLog.ts`、`roomLogStore.ts`                                     | —    | 残す                               |
| L16 | 参加者の算出（直近 5 分）                        | `getRecentParticipants`                                                   | —    | 残す（手がかりは S9）              |
| L17 | 日時の表記、URL のリンク、管理人の発言の分割表示 | `format.ts`、`urlLinker.ts`、`ChatMessage`                                | —    | 残す                               |
| L18 | 文字数カウンタ、色のパレットと正規化             | `ChanariCharCounter`、`colorCode.ts`                                      | —    | 残す（サーバーも S1 で確かめる）   |
| L19 | 会話成立の計測                                   | `conversationMeasurement.ts`                                              | —    | 残す                               |
| L20 | 訪問回数・前回ログイン                           | `settingsStore.ts`                                                        | —    | 残す（サーバーは範囲だけ確かめる） |
| L21 | 部屋の題名・紹介文・トップの静的な内容           | `rooms.ts`、`top/data.ts`                                                 | —    | 残す（ビルド時に使う）             |
| L22 | ツーショットの規則                               | `supabase/functions/two-shot/rules.ts`                                    | —    | 既にサーバーが正                   |

## 5. 移すもの

各項目に、現状・移行後・性能・互換と手順・テストを書く。

### S1 入力の上限と形式

**現状**: 上限は画面の `maxLength` と `validateName` にしかない（§3.1）。

**移行後**:

- `save-chat` に検証を足す。上限は画面より緩いか同じにし、画面を正しく使う人が拒否されないようにする
  - `name`: 前後の空白を除いて 1〜24 文字（コードポイント）。画面の `maxLength=24` は UTF-16 の単位なので、これより緩い
  - `message`: 1〜120 grapheme（`Intl.Segmenter`。ちゃなりの `countChars` と同じ数え方。通常チャットの `maxLength=120`
    は UTF-16 の単位なので、これより緩い）
  - `color`: 12 文字以内。`#rgb`・`#rrggbb`・CSS の色名なら小文字にして保存し、それ以外（画面の自由入力で入る
    「あか」など）は**拒否せず**既定の `#ff69b4` に置き換える。今はブラウザが解釈できない色を無視して表示が端末ごとに
    ばらつくので、どのクライアントでも同じ色になる
  - `email`: 64 文字以内で、制御文字を含まない。形は確かめない（画面は「E-Mail/URL」の自由入力で、リンクにするときの
    スキームは表示側が `http` / `https` / `mailto` に限っている）
  - エラーは `{ "error": { "code": "invalid_name" } }` の形で返す。画面の文言はクライアントが code から選ぶ
- DB に CHECK 制約を足す。正確な上限は Edge が持ち、DB は壊れた値と大きすぎる値を止める最後の防壁にする
  （`char_length(name) BETWEEN 1 AND 64`、`char_length(message) BETWEEN 1 AND 2000`、
  `char_length(color) <= 32 AND color ~ '^[#A-Za-z0-9]+$'`、`email IS NULL OR char_length(email) <= 256`）
- 上限の値は、依存の無い TypeScript のファイル（`supabase/functions/save-chat/schema.ts`）に 1 か所で置き、Web は
  ツーショットの `rules.ts` と同じく相対パスで import する

**性能**: 文字列の検証は 1 要求あたり数十 µs 以下。CHECK は挿入ごとに定数時間。往復は増えない。

**互換と手順**:

1. 検証を「記録だけ」で入れる（違反を New Relic に記録し、保存は通す）。1 週間、違反が正規の画面から出ていないことを確かめる
2. CHECK 制約を `NOT VALID` で足す（既存の行は確かめず、新しい行だけに効く）。既存の行の違反を数え、問題が無ければ
   `VALIDATE CONSTRAINT`（`SHARE UPDATE EXCLUSIVE` のロックなので発言の保存は止まらない）
3. 検証を拒否に切り替える

**テスト**: `handler.test.ts` に境界（24 / 25 文字、120 / 121 grapheme、絵文字と結合文字、色の形、`javascript:` の
メール）、pgTAP で CHECK 制約。

### S2 `metadata` の形

**現状**: `save-chat` は受け取った `metadata` をそのまま保存し、読む側（`normalizeChatMetadata`）が知らない値を捨てている。

**移行後**:

- `save-chat` が `metadata` を許可リストで作り直して保存する: `version: 1`、`fontStyle`（`fontSize` 1〜5、`fontColor`
  15 色、`bold`）、`avatar`（13 種）、`optimisticNonce`（64 文字以内）。`kind`・`userColor`・`visitCount`・`lastLogin`・
  `event`・`subject` は利用者の発言では受け付けない（S5・S6 でサーバーが書く）
- 許可リストは S1 と同じ `schema.ts` に置き、Web の `normalizeChatMetadata` も同じものを使う
- DB に CHECK 制約: `metadata IS NULL OR (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 2048)`
- 読む側の `normalizeChatMetadata` は、既存の行のために残す

**性能**: 小さな JSON を 1 回たどるだけ。保存する `metadata` が小さくなることはあっても大きくはならない。

**互換と手順**: S1 と同じく「記録だけ」→ 拒否。今の Web が送る `metadata` は許可リストの中に収まる。

### S3 `system` フラグと予約名

**現状**: `system: true` と名前「管理人」「巫女」は、クライアントが自由に付けられる。

**移行後**:

- 利用者の発言（`op: "say"`）では `system` を常に `false` にする。`system: true` はサーバーが作る発言（S5・S6、
  triage の返信）だけ
- 利用者の発言と入室で、名前が予約名なら拒否する（NFKC に正規化し、空白を除いて比べる。一覧は D4）
- これで `chat_ranking` と `room_participant_counts` の「管理人の発言を除く」が信用できる値になる（§3.3）

**性能**: S1 と同じ。

### S4 部屋 ID の正当性

**現状**: 部屋の一覧は `rooms.ts` にしかない。`save-chat` は任意の `room_id` を保存し、Web は読むときに知らない ID を
`superbeginner` に読み替えている（`normalizeChat`）。

**移行後**:

- 表 `rooms(id text PRIMARY KEY, category text NOT NULL, enabled boolean NOT NULL, triage boolean NOT NULL DEFAULT false)`
  を作る。行は `rooms.ts` から生成したマイグレーションで入れ、Vitest で `rooms.ts` と一致することを確かめる
- `chats.room_id` に外部キーを足す（`NOT VALID` → 既存の行に知らない ID が無いかを数えてから `VALIDATE`）
- `enabled = false` の部屋への発言は `save-chat` が拒否する。triage の対象（今は `triage.ts` の `com_sb` 固定）は
  `rooms.triage` で決める
- 部屋の題名・紹介文・カテゴリ名は**フロントエンドに残す**。SSG とプリレンダがビルド時に使い、実行時に取りに行くと
  最初の表示が遅くなるため

**性能**: 挿入ごとに 82 行の表の主キーを 1 回引く（常にメモリにある）。外部キーは `rooms` の行に `KEY SHARE` のロックを
取るが、`rooms` はほぼ更新しないので待ちは起きない。往復は増えない。

### S5 入退室の管理人の発言

**現状**: `useChatSession` が `createAdminChat` で「`{name} さん、Welcome to お気楽チャット☆`」「`{name}さん、
またきておくれやすぅ。`」と `metadata`（`kind: "admin"`、`avatar: "hoshi1"`、`userColor`、`visitCount`、`lastLogin`）
を作って保存している。

**移行後**:

- `save-chat` に `op` を足す（省略時は `say`。今の Web の要求はそのまま通る）

  ```jsonc
  { "op": "enter", "room_id": "superbeginner", "name": "ゆい", "color": "#ff69b4",
    "visit_count": 49, "last_login": 1735806900000, "nonce": "…" }
  { "op": "exit", "room_id": "superbeginner", "name": "ゆい", "color": "#ff69b4", "nonce": "…" }
  ```

- サーバーが今と 1 文字も違わない文言と `metadata` で管理人の発言を作り、`system: true` で保存する。`visit_count` は
  0〜1,000,000 の整数、`last_login` は 0〜現在時刻に丸める（端末の中の値なので、範囲だけ確かめる）
- 文言の組み立ては依存の無いファイル（`supabase/functions/save-chat/messages.ts`）に置き、Web は楽観的な表示にだけ
  同じ関数を使う。保存される内容はサーバーが決め、`nonce` で楽観的な行と突き合わせる（今の仕組みのまま）

**性能**: 往復 1 → 1。サーバーの処理は文字列の組み立てだけ。楽観的な表示を続けるので、体感は変わらない。

**残る限界**: 名前の本人確認は無いので、他人の名前で退室の発言を出せるのは今と同じ。S7 の author key で「その端末が
直近にその名前で入室している」ことを条件にする案は、必要になったら検討する。

### S6 おみくじ

**現状**: 利用者の発言を保存した後、クライアントが運勢を選んで巫女の発言をもう 1 回保存している（往復 2 回。巫女の
保存の失敗は無視）。運勢の 12 通りはクライアントのコードにある。

**移行後**:

- `op: "say"` の本文が前後の空白を除いて `おみくじ` なら、`save-chat` が利用者の発言と巫女の返事（`kind: "fortune"`、
  名前「巫女」、`hotpink`、`miko1`、`system: true`）を 1 回の RPC で保存する。`uuidv7_sub_ms()` は行ごとに
  `clock_timestamp()` を読むので、巫女の返事は必ず利用者の発言より後に並ぶ
- 応答に巫女の行を `extra` として入れる。クライアントは `applySaved` で合流する（Realtime でも届くが uuid で重ならない）
- 運勢は `messages.ts` に移し、`fortuneBot.ts` と `sendFortuneIfCommand` を消す

**性能**: 往復 2 → 1。巫女の返事が出るのは、今は「発言の保存の完了 → 巫女を楽観的に表示」、移行後は「発言の保存の
応答に含まれる」なので、同じか早い。

### S7 `clear`（自分の発言の消去）

**現状**: `clearChatLogsByName` が PostgREST で `room_id` と `name` が一致する行に `deleted = true` を立てる。条件は
クライアントが決めるので、他人の名前でも全部屋でも消せる（§3.2）。全部屋まとめは、手元に読み込んだログに自分の発言が
あるかで「削除対象の発言がありません」を出している（L13）。

**移行後**:

- 端末（ブラウザ）ごとに 32 バイトの乱数（author key）を作って `localStorage` に持ち、`save-chat` に
  `x-chat-author-key` ヘッダで送る（Android は DataStore）
- `save-chat` の DB への書き込みを SQL 関数 `insert_chat(...)` 1 回にまとめ、その中で `chats` と
  `chat_authors(chat_uuid uuid PRIMARY KEY REFERENCES chats, author_key_hash bytea NOT NULL)` に書く。`chat_authors` は
  RLS を有効にしてポリシーを作らず、Realtime の publication にも入れない（`chats` に列を足すと Realtime で流れる
  おそれがあるため）。`(author_key_hash)` にインデックス
- SQL 関数 `clear_my_chats(p_room_id text, p_name text, p_author_key text) RETURNS integer`（`SECURITY DEFINER`、
  `search_path` を固定、anon に実行を許可）が、`chat_authors` のハッシュ・部屋・名前が一致し、まだ消していない行だけに
  `deleted = true` を立て、消した件数を返す
- 全部屋まとめの「削除対象の発言がありません」は、戻り値が 0 のときに出す（手元のログで決めない）
- Web を切り替えて 1 日たったら（開いたままのタブの猶予）、anon の `public-update` ポリシーと `UPDATE (deleted)` の
  権限を外す

**性能**:

- `clear`: PATCH 1 往復 → RPC 1 往復。Edge Function を通さないのでコールドスタートは無い。実行計画は
  `chat_authors (author_key_hash)` のインデックス → 主キーで `chats` → 部屋・名前・`deleted` の確認で、その端末の発言の
  数だけ読む
- 保存: `chat_authors` への 1 行（インデックス 2 つ）が増える。1 件あたり数十 µs の書き込みで、`save-chat` の DB への
  往復は 1 回のまま（`.insert()` を `.rpc('insert_chat')` に替える）

**互換**: 移行前の発言には `chat_authors` の行が無いので、`clear` で消せなくなる（D2）。ブラウザのデータを消した・別の
ブラウザを使った場合も、それより前の発言は消せない。画面の [消す] の説明に書く。

### S8 `look` / `unlook` の通知

**現状**: 送り手は発言を保存した後、Realtime の broadcast で `look` を送り、受け手の `useLookSound` はその broadcast
で音を鳴らす。部屋ごとに `chats-postgres-<room>` と `chats-broadcast-<room>` の 2 つの channel を張っている。
broadcast は誰でも送れる（§3.2）。

**移行後**:

- 受け手は、Room_Log_Store が Realtime で受けた INSERT（`useRoomLog` に渡している `onRealtimeChat`）のうち、本文が
  `look` / `unlook` のもので鳴らす・止める。取得（fetch）で入った過去の発言と、自分の発言（`nonce` / uuid が自分のもの）
  では鳴らさない（今と同じ規則）
- 送り手は今と同じく、保存の完了で自分の音を鳴らす
- `broadcastLookEvent` / `broadcastUnlookEvent` / `onLookBroadcast` と broadcast の channel の登録簿を消す

**性能**: 部屋ごとの channel が 2 → 1（WebSocket の join が 1 つ減る）。受け手に届くまでは、今は「保存の確定 → 送り手が
応答を受け取る → broadcast を送る → 受け手」、移行後は「保存の確定 → `postgres_changes` → 受け手」で、送り手の応答待ちと
broadcast の片道が無くなるので同じか早い。

**互換**: 切り替えの前後で、古いタブの送り手（broadcast だけ送る）と新しいタブの受け手が混ざっても、新しい受け手は
INSERT で鳴るので漏れない。古いタブの受け手は 1 日で読み込み直される。broadcast を送る人がいても、聞く人がいなくなる
ので害は無くなる。

### S9 入退室の判定の手がかり

**現状**: 参加者（`getRecentParticipants`）とログの表示（`splitAdminMessage`）は、管理人の発言の本文を正規表現で読んで、
誰が入った・出たかを決めている。文言が 1 文字変わると参加者一覧が壊れる。

**移行後**:

- S5 でサーバーが `metadata` に `event: "enter" | "exit"` と `subject: { name, color }` を書く（本文の文言は今のまま）
- クライアントは、構造があればそれを使い、無い古い行だけ今の正規表現で読む。参加者の算出そのものはクライアントに残す（§6）

**性能**: 正規表現の評価が減るだけ。

### S10 論理削除した発言を誰に見せるか（D1 を決めてから）

**現状**: 部屋のログは `deleted = false` をクライアントが条件に付けて読み、全部屋まとめは付けずに削除済みも出している
（`.kiro/specs/react-2026-refactoring/design.md` の意図した違い）。RLS は `USING (true)` なので、API からは誰でも削除済みの
発言を読める。つまり `clear` は画面から消すだけで、内容は公開のまま残っている。

**案 A（推奨）**: anon / authenticated の SELECT の RLS を `USING (deleted = false)` にする。

- 全部屋まとめも削除済みを出さなくなる（挙動が変わる）
- ランキングは「deleted を問わず全期間」を保つため、`chat_ranking` を所有者の権限で動くビュー
  （`security_invoker = false`）にする。出すのは集計値だけなので、削除済みの本文は出ない
- `room_participant_counts` は既に `deleted = false` で数えているので変わらない

**案 B**: 今のまま。[消す] の説明を「表示から消す（内容はサーバーに残る）」に直す。

**性能（案 A）**: 部屋のログの問い合わせは既に `deleted = false` を含み、部分インデックス `idx_chats_room_deleted_uuid`
を使うので、実行計画は変わらない。全部屋まとめは主キーの逆順の走査に `deleted = false` の絞り込みが付くだけ
（削除済みは少ない）。Realtime の INSERT は常に `deleted = false` なので、RLS の判定は式が 1 つ増えるだけで通る。

**あわせて確かめること**:

- 件数の上限: 取得の件数は画面の選択肢（最大 1000）で決めている。Supabase の API 設定 `max_rows`（既定 1000）が本番で
  有効なことを確かめる
- Realtime の `postgres_changes` の INSERT のペイロードに、anon が列の権限で読めない `ip` が含まれていないか
  （`realtime.ts` の全部屋まとめの購読のコメントに「realtime payload には email / ua が含まれる」とあり、SELECT で選んだ
  列とは関係なく行の値が届いている）。含まれていれば、`ip` を `chat_authors` と同じ非公開の
  表へ移し、`insert_chat` の中で書く（往復は増えない。`ip_masked` は生成列から `insert_chat` が書く普通の列に替える）

## 6. 移さないもの

| ロジック                                    | 移さない理由                                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 楽観的表示と確定値の突き合わせ（L14）       | 保存を待たずに出すための仕組みで、サーバーに置くと意味が無い                                                                                                                                                              |
| ログの合流と並び（L15）                     | Realtime で届いた 1 行を手元のログに入れる処理。サーバーで並べると毎回ログ全体を取り直すことになる                                                                                                                        |
| 参加者の算出（L16）                         | Realtime で届く発言から毎分作れる。サーバーに移すと毎分の問い合わせか Presence が要る。手がかりの構造化だけ S9 で行う。入室前は 10 件しか読まないので参加者が少なく見える問題は、Presence の導入（成長戦略 P0）で別に扱う |
| 日時・URL のリンク・管理人の分割表示（L17） | 表示の関心。サーバーで整形すると端末の時刻の設定や画面の都合に合わせられない                                                                                                                                              |
| 文字数カウンタ・色の補助（L18）             | 入力の補助。サーバーは S1 で確かめ直すので、ずれても保存される値は守られる                                                                                                                                                |
| 会話成立の計測（L19）                       | GA のセッションと入口（`entry_context`）に結び付けるための計測。サーバーで同じ定義の集計を別に作ることはできるが、置き換えにはならない                                                                                    |
| 訪問回数・前回ログイン（L20）               | 端末の中にしか無い値。サーバーは S5 で範囲だけ確かめる                                                                                                                                                                    |
| 部屋の題名・紹介文・トップの内容（L21）     | ビルド時の SSG に使う。実行時に取りに行くと最初の表示が遅くなる                                                                                                                                                           |
| ちゃなりの下書き・リロード秒                | 端末の中の設定                                                                                                                                                                                                            |
| ツーショット（L22）                         | 既にサーバー（`rules.ts` と Edge Function `two-shot`）が正で、クライアントは結果を描くだけ                                                                                                                                |

## 7. 消すもの

- **人数のクライアント集計**（`fetchCountsFromRows`、`buildRoomCountsUrl`）: RPC `room_participant_counts` が無いとき
  （404）だけ使う経路。マイグレーション `20260923000000` が本番に適用済みであることを確かめてから消す
- **オフライン時の mock のログ**（`fallback.ts`）と、それを数える `aggregateChatRanking`: 本物の会話に見える偽のログを
  出すのは誤解を招く（D3）。消す場合は「接続できません」の表示と [再読み込み] に替える。Android 版も出さない方針
- **全部屋まとめの事前確認**（`isClearTarget` による判定）: S7 の戻り値で置き換える
- **`fortuneBot.ts`・`createAdminChat` の保存の部分・broadcast の登録簿**: S5・S6・S8 で不要になる

## 8. 性能の確かめ方

「劣化しない」を数字で確かめてから締める。

- **ベースライン**: 切り替えの前 7 日の New Relic（`.kiro/specs/observability-new-relic` の計装）
  - Browser: `send-chat` インタラクションの時間（p50 / p95）、`clear` の PATCH の Ajax の時間
  - `save-chat`: サーバーのスパン `POST save-chat` と `db insert chats` の時間、エラー率
- **合否**: 各指標の p95 がベースラインの 1.1 倍以内（ばらつきの範囲）。おみくじは巫女の返事が出るまでが短くなること。
  検証の拒否（S1〜S3）が、正規の画面からの要求で起きていないこと
- **DB**: ローカルの DB（`supabase start`）に 100 万行の `chats` を作り、`EXPLAIN (ANALYZE, BUFFERS)` で部屋のログ・
  全部屋まとめ・`clear_my_chats`・`insert_chat` の計画と時間を、変更の前後で PR に記録する
- **Realtime**: 2 つのブラウザで `look` を送り、受け手に鳴るまでの時間を前後で比べる（手動）

## 9. 移行の順序

「足す → Web を切り替える → 締める」の順。Web は全ページ読み込みなので、配信の後に読み込み直せば新しいコードになる。
開いたままの古いタブのため、締めるのは切り替えから 1 日以上たってからにする。

| PR  | 内容                                                                                                                       | 項目       | 種別            |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------- |
| P1  | `save-chat` の Deno テストと、`chats` の pgTAP を CI で走らせる（今は `two-shot.yml` だけ）                                | —          | CI              |
| P2  | `schema.ts`、検証を「記録だけ」で入れる、CHECK 制約を `NOT VALID` で足す                                                   | S1〜S3     | Edge + DB       |
| P3  | `rooms` 表、外部キー（`NOT VALID`）、`rooms.ts` との一致のテスト                                                           | S4         | DB + Web        |
| P4  | `insert_chat` RPC、`chat_authors`、author key の受け取り（Web は鍵を作って送り始める）                                     | S7 の前半  | DB + Edge + Web |
| P5  | `op`（`enter` / `exit` / `say`）、巫女の返事、`metadata.event` / `subject`、`messages.ts`；Web を切り替える                | S5・S6・S9 | Edge + Web      |
| P6  | `clear_my_chats` と Web の切り替え                                                                                         | S7         | DB + Web        |
| P7  | `look` / `unlook` を INSERT から鳴らし、broadcast を消す                                                                   | S8         | Web             |
| P8  | 締める: 検証を拒否に、利用者の `kind: admin / fortune` と `system: true` の拒否、`public-update` を外す、制約の `VALIDATE` | S1〜S7     | Edge + DB       |
| P9  | S10（D1 の決定後）と §7 の削除                                                                                             | S10・§7    | DB + Web        |
| P10 | 文書: `docs/ARCHITECTURE.md` §7・§12、`CLAUDE.md` の Data Flow、`README.md`                                                | —          | docs            |

P8 の前に §8 の合否を確かめる。問題があれば P8 を止め、足した機能は残したまま原因を直す。

## 10. 決めること

| ID  | 論点                                        | 推奨                                                                                                                                                                                     |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 論理削除した発言を API からも隠すか（S10）  | **案 A（隠す）**。全部屋まとめでも削除済みを出さなくなる                                                                                                                                 |
| D2  | 移行前の発言を `clear` で消せるようにするか | **消せないままにする**（名前だけの照合を残すと今の穴が残る）。必要なら運営が消す                                                                                                         |
| D3  | オフライン時の mock のログ                  | **消す**。「接続できません」と [再読み込み] にする                                                                                                                                       |
| D4  | 予約名                                      | **「管理人」「巫女」**。NFKC に正規化し、空白を除いて比べる。運営が画面から「管理人」の名前で書いているなら、別の経路（`service_role` で書く小さな管理用の手段）を先に用意してから締める |
| D5  | 発言の長さの単位                            | **120 grapheme**（ちゃなりと同じ。通常チャットの `maxLength=120` より緩いので正規の利用者は拒否されない）                                                                                |

## 11. リスクと対策

| リスク                                         | 対策                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| 締めたら正規の利用者が拒否される               | 「記録だけ」の期間で違反の出どころを確かめてから締める（S1〜S3）                   |
| 開いたままの古いタブが古い送り方を続ける       | `op` を省いた要求は `say` として受け、締めるのは 1 日以上たってから                |
| author key を失った利用者が発言を消せない      | [消す] の説明に書く。運営の削除で補う                                              |
| 大きな表への制約の追加でロックがかかる         | `NOT VALID` で足してから `VALIDATE`（発言の保存を止めないロック）                  |
| Realtime のペイロードに `ip` が含まれている    | S10 で確かめ、含まれていれば非公開の表へ移す（往復は増えない）                     |
| `insert_chat` の不具合で発言が保存できなくなる | P4 は既存の `.insert()` の経路を残したまま、環境変数で切り替えられるようにして出す |

## 12. 範囲外

- 連投・同文・NG ワード・接続元ごとの制限（`docs/GROWTH_STRATEGY.md` §7.1）。入れる場所は本書の `save-chat` /
  `insert_chat` と同じなので、この形にしておけば後から足せる
- 通報の仕組み（`.kiro/specs/android-native-app/design.md` §7.3）
- Presence による「今いる人」の表示
