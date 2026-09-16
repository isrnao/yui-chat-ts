# ルーム内PGroonga検索

## 目的と公開状態

ルーム内の過去の発言を探し、前後の会話を確認して現在の会話へ戻る機能。
`chats.message`の部分索引を使い、キーワード検索にキュー・別DBへの複製・Embeddingは追加しない。
通常UIとちゃなりUIで共通の検索画面を利用する。全部屋まとめ`all`は対象外。

**マージだけでは検索を公開しない。** フロントの許可ルームとサーバーのフラグは既定で無効。
本番の拡張版・負荷・復旧設定はこのPRでは検証していない。下記の公開前検証を満たしてから有効化する。
成長目標は検索回数ではなく、再発見した会話から現在の会話へ戻る体験の改善。

## 実装の境界

- 初期30日、選択で90日。本文のみ、空白で分けた最大5語のAND、各語2文字以上・全体80文字以内。
- PGroonga `&@`へ語を別々にバインドする。OR・正規表現・ユーザー入力のSQL構文は受け取らない。
- `deleted=false`、`system IS NOT TRUE`、ルーム、期間をSQL条件にする。名前・systemは本人確認に使わない。
- UUID降順に20件（API上限50）。総件数を計算しない。署名したカーソルはルーム・語・期間に束縛し15分で失効。
- ページ間の完全なスナップショットは保証しない。新着は再検索で取得。UIでUUID重複を除去。
- 前後取得は同一SQLスナップショットで対象を確認し、前後各5件を返す。削除対象から隣接発言だけを返さない。
- excerptは先頭240文字のプレーンテキスト。現行投稿UIの上限120文字を超える既存データでは一致部分が表示外になる場合がある。
- 表示名は256文字まで。返却はuuid、roomId、name、time、excerptのみ。IP・UA・email・metadataは返さない。
- 検索語はURL・永続ストレージ・GA4へ送らない。エラーを0件へ変換しない。検索結果は`no-store`。
- フォーカス復帰・結果選択・再検索で再検証する。既に配信した本文の取消しや全端末への削除即時通知は提供しない。

ルーム定義の正は`src/features/chat/rooms.ts`。変更時は`pnpm generate:search-rooms`を実行し、
生成した`supabase/functions/_shared/chatRoomIds.ts`もコミットする。CIが一致を確認する。
`save-chat`もこの許可リストを使い、不明なroom_idや集約IDへの書き込みを拒否する。

## 認証・権限

現在は匿名チャットであり、ユーザー認証やルーム所属テーブルは導入していない。
検索専用の`chat_search_reader`はLOGIN・NOBYPASSRLS・NOINHERIT、必要列だけSELECT可能。
Edgeはこのロールでtransaction poolerに接続する。実行時にもcurrent_userと管理権限を確認し、
postgres/service_role接続や索引未作成・読取厳格化前なら503にする。
SQLの受付はEdgeに限定し、anonが直接呼べる検索RPCは公開しない。

投稿には従来どおりsave-chatを使う。検索のRedis・フラグに投稿を依存させない。
既存の公開ログ読取API全体の収集対策は、このゲートウェイの範囲外。

## 削除操作の移行

公開SELECTを未削除行に限定すると、直接UPDATEとRETURNINGの組み合わせに影響する。
このため追加マイグレーションは先に`clear_chat_logs(room_id, name)`を作り、
フロントの`clearChatLogs`/`clearChatLogsByName`をそのRPCへ移す。
その後`harden_chat_reads.sql`で匿名のSELECTを厳格化し、直接UPDATEを撤去する。

このRPCはSECURITY DEFINERだが、固定SQLでdeletedだけを更新し本文を返さない。
`p_name=NULL`はルーム全体、空文字は空文字名だけを対象にする。
従来の匿名clear/cutの意味を維持する。表示名の一致は本人の証明ではなく、
本人のみ削除・管理者のみ全削除への変更には別の権限設計が必要。

古いキャッシュ済みクライアントの直接UPDATEは厳格化後に失敗する。
RPCを追加→新フロント配信→更新案内と旧クライアントの移行確認→厳格化、の順で公開する。
サーバー側の厳格化を済ませるまでは検索を有効化しない。

## 設定

### ブラウザ（公開設定）

| 変数                     | 値                                               |
| ------------------------ | ------------------------------------------------ |
| `VITE_CHAT_SEARCH_ROOMS` | 先行公開対象のルームIDをカンマ区切り。空で非表示 |

### search-chatsのSecret/サーバー設定

| 変数                      | 内容                                                                     |
| ------------------------- | ------------------------------------------------------------------------ |
| `SEARCH_ENABLED`          | `true`だけ受付。その他は503                                              |
| `SEARCH_ROOM_IDS`         | サーバー許可ルーム。既知IDとの積集合。空なら検索を許可しない             |
| `SEARCH_ALLOWED_ORIGINS`  | 例`https://www.okiraku.chat`。カンマ区切り                               |
| `SEARCH_DATABASE_URL`     | `chat_search_reader.PROJECT_REF`でshared transaction poolerに接続するURL |
| `SEARCH_SIGNING_SECRET`   | 十分にランダムな32文字以上。カーソルと短期レートキー署名用               |
| `SEARCH_REDIS_URL`        | Upstash互換のRedis REST HTTPSエンドポイント                              |
| `SEARCH_REDIS_TOKEN`      | 上記へのSecret。ブラウザに渡さない                                       |
| `SEARCH_CLIENT_IP_HEADER` | 信頼する入口で必ず上書きされるIPヘッダ名。確認前は未設定で停止           |

専用ロールのパスワードは管理用psqlの`\password chat_search_reader`等で設定し、
Secretに接続URLを保存する。SQL・PR・コミットにパスワードを記載しない。
Supabaseの実プロジェクトで専用ロールのpooler接続とTLSを検証する。
CORSは認証ではない。Originなしの非ブラウザ要求にも同じ受付制限とDB権限を適用する。

IPヘッダの偽装テスト（クライアントが値を付けても入口で上書きされること）を公開条件にする。
この前提を保証できなければ検索を停止し、保証できるゲートウェイを用意してから有効化する。
生IPは短期HMAC化し、Redis側のキーは最終利用から120秒で失効する。
Redis TIME+Luaのtoken bucketで利用者ごと容量5・毎秒0.5補充、全体容量20・毎秒20補充。
全体上限は小さく開始してDB計測結果で調整する。Redis障害は503で閉じる。
1インスタンスで同時に扱う検索SQLは1件。接続待ちキューを増やさず追加要求は429。
専用ロールはDB接続上限4、SQLタイムアウト1秒、1接続/Edgeインスタンスで起動する。
これらの上限がSupavisorの実プール設定と両立することも負荷試験で確認する。

## 導入順序

1. ステージングで`preflight_chat_search.sql`を実行。本番はまず同じ読取調査だけを行う。
   PostgreSQL/PGroonga版、拡張の配置、実ポリシー、索引、容量、投稿p95を記録する。
2. `20260916000000_chat_search_access.sql`を適用。検索ロールと削除RPCの権限を確認する。
3. 検索フラグOFFのままフロントとsave-chatを配信。clear/cutがRPCで動作することを確認。
4. 旧クライアント移行後に`psql -v ON_ERROR_STOP=1 -f supabase/operations/harden_chat_reads.sql`。
5. `create_chat_search_index.sql`を**独立したpsqlセッション**で実行。BEGIN/transactionへ入れない。
   CONCURRENTLYでもCPU・I/Oと待ちが発生する。既存同名索引があれば状態を点検し、盲目的に再実行しない。
6. search-chatsを配信し、Secretと許可ルームを設定する。まずステージングのみSEARCH_ENABLED=true。
7. 結合・混在負荷・復元・IPヘッダ試験に合格後、本番のサーバーを有効化する。
8. 最後に3〜5ルームのVITE_CHAT_SEARCH_ROOMSを設定してフロントを配信し、段階的に観測する。

この手順の本番実行やサイト公開は、実装・PR作成には含まれない。

## 検証コマンド

```sh
pnpm check:search-rooms
pnpm typecheck
pnpm exec vitest run src/features/chat/search src/features/chat/api/chatApi.test.ts --coverage=false
node --experimental-strip-types --test supabase/functions/search-chats/*.test.ts
deno check --node-modules-dir=manual --config supabase/functions/search-chats/deno.json supabase/functions/search-chats/index.ts
pnpm build
```

GitHub Actionsの`Chat search checks`はPGroonga 4.0.8 / PostgreSQL 17の固定イメージに、
全マイグレーションと運用SQLを適用し、実ロールのSELECT・列権限・clear/cut・日本語AND検索を確認する。
`supabase/tests/bootstrap.sql`と試験データは使い捨てDB専用。本番で実行しない。
CIで新しい版が成功しても、本番Supabaseに搭載された版・復旧構成の合格には代えない。

公開前には実データ分布を模した評価セットを用意する。日本語、英数字、全半角、記号、
広く一致する語、0件、複数語、ページ送り、削除集中を含める。既定TokenBigramは
英字の任意部分一致を保証しない。語の正規化や検索仕様をUI評価と合わせて確認する。

採用目標（暫定）：検索API p95 800ms以下、SQL p95 300ms以下、投稿p95悪化15%以内。
「索引なし」「索引あり・検索なし」「投稿＋検索」「削除集中」「索引作成中」を比較する。
既知の50検索ケースで95%以上の期待発言発見を目標にし、実績と仮説を区別する。

## 観測と復旧

追加イベントはsearch_submitted/results/result_opened/return_to_chat。
ルーム、期間、結果件数帯、待ち時間帯だけを送り、検索語・そのハッシュ・本文・名前を送らない。
GA4の自動フォーム計測、Edgeログ、DBエラー時パラメータ記録も公開前に確認する。
コードは生のSQL例外をログ/応答へ出さないが、DB側のログ設定までは変更しない。

検索負荷が原因ならSEARCH_ENABLED=falseで受付停止する。
**索引更新が原因ならフラグOFFだけでは投稿負荷は戻らない。**
`rollback_chat_search_index.sql`を運用手順に従って実行する。索引撤去で待ちが発生する場合がある。
検索のロールバック時にも読取RLSをUSING(true)へ戻さない。古い直接UPDATEクライアントへも戻さない。

索引作成に失敗したらpg_indexのindisvalid/indisreadyを点検する。
INVALID索引の影響を確認してからCONCURRENTLYで削除し、原因解消後に再作成する。
PGroonga固有のファイルも含むディスク使用量と再構築時の余裕を計測する。
復元演習でchatsを正として索引を作り直し、既知発言の検索を照合し、復旧所要時間を記録する。

WAL resource manager、旧方式、crash-saferを同一視しない。本番Supabaseの実設定・提供機能を確認する。
検索用の読取接続を分けても同じDBのCPU/I/Oと拡張障害は共有する。

公式仕様：

- [Supabase PGroonga](https://supabase.com/docs/guides/database/extensions/pgroonga)
- [接続とpooler](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [PGroonga RLS / v2演算子](https://pgroonga.github.io/reference/)
- [索引の設定](https://pgroonga.github.io/reference/create-index-using-pgroonga.html)
- [PGroonga replication](https://pgroonga.github.io/reference/replication.html)
- [CREATE INDEX CONCURRENTLY](https://www.postgresql.org/docs/current/sql-createindex.html)
