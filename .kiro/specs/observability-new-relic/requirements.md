# Requirements Document: observability-new-relic

## Introduction

お気楽チャットTS（yui-chat-ts）と評価 API（okiraku-api）に New Relic を導入し、
**送信操作 1 件を「Browser 操作 → 通信 → save-chat → DB 保存 → 非同期 triage → /evaluate → AI 呼び出し」まで追える状態**を作る。
異常は PagerDuty へ通知し、通知したインシデントが「どう閉じるか」まで定義する。

本 spec は 2026-09-22 の 2 回のレビュー指摘を反映した改訂版である。1 回目は AI SDK の計測方法・Deno のコンテキスト継承・アラートの復旧条件・PII・DB メトリクス・E2E 合格条件・pino/PagerDuty/無料枠、2 回目は通知とサンプリングの独立・C1 のクローズ条件・本番での復旧確認・リトライの追跡・2 段階 flush・C7 の導入順を扱った。
各指摘の妥当性判断と根拠は design.md「レビュー指摘の検証結果」に記録する。

現状の前提:

- 外形監視は HetrixTools（1 分間隔、`www.okiraku.chat` と `api.okiraku.chat/api/health`）→ PagerDuty サービス `okiraku.chat`（連携 `HetrixTools - okiraku.chat`）で運用中（README「監視・障害通知」）。
- save-chat（Supabase Edge Function, Deno）は保存後、`com_sb` の発言だけ `EdgeRuntime.waitUntil` で triage を実行し、`https://api.okiraku.chat/api/v1/evaluate` を呼ぶ。
- okiraku-api（Vercel Functions, Node 24, Hobby 前提）の評価処理は `ai@7.0.105` の **`experimental_evaluate`** を使う。この関数は `experimental_telemetry` を受け取らない（実装確認済み）。`result.usage` の各値は `number | undefined`。
- okiraku-api の `handler.ts` は既に `requestId` / `status` / `durationMs` を JSON でログ出力し、本文・Authorization・生のプロバイダエラーを意図的に除外している。
- `triage.ts` には応答本文をエラー文に埋め込む処理がある（`JEV returned unexpected payload: ${JSON.stringify(body)}`、`GitHub responded ...: ${await res.text()}`）。`save-chat/index.ts` は DB エラー文をそのままクライアントへ返している。
- `@supabase/supabase-js` は `^2.105.4`。W3C Trace Context 伝播オプション `tracePropagation` は 2.106.0 以降。

本 spec は「1 本につなげられる」と断定しない。**対応環境・サンプリング・伝播を検証し、検証できた区間を 1 本のトレースとしてつなげる**。検証できない区間は、つながらない理由と代替の相関手段（共通 ID・ログ）を記録する。

## Glossary

- **Browser_Agent**: New Relic Browser エージェント（`@newrelic/browser-agent`）。OTLP ではなく New Relic 独自プロトコルで送信し、W3C `traceparent` / `tracestate` を送信先に付与できる
- **OTLP_Endpoint**: New Relic の OTLP 受け口（US: `https://otlp.nr-data.net`、EU: `https://otlp.eu01.nr-data.net`）。`api-key` ヘッダーにライセンスキーを付ける
- **Request_Context**: 1 リクエスト分の OpenTelemetry `Context`（親スパン情報を含む）。save-chat では関数引数で明示的に受け渡す
- **Telemetry_Flush**: トレースとログのバッファを OTLP_Endpoint へ送り切る処理。トレースとログは別々に flush する
- **Save_Trace**: 1 回の送信操作に対応するトレース。Browser の AJAX スパン → save-chat サーバースパン → DB スパン →（com_sb のみ）triage → /evaluate → 評価処理スパン
- **Evaluate_Span**: okiraku-api で `experimental_evaluate` 呼び出しを囲む手動スパン
- **Error_Summary**: 外部送信してよいエラー情報。`error.code`（列挙値）・処理名・HTTP ステータス・サニタイズ済みメッセージで構成する。DB（PostgREST）のエラーに限り、`error.message` もそのまま含めてよい（2026-09-22 決定。先頭 500 文字まで）
- **Paging_Condition**: PagerDuty へ通知する New Relic アラート条件。初期版はサーバー側の保存失敗を主条件にする
- **Observed_Clear**: アラート条件の値が発報しきい値を下回り、New Relic がインシデントを自動クローズした状態。集計窓内に失敗が残っていてもこの状態になり得るため、復旧を意味しない
- **Verified_Recovery**: **障害が起きたのと同じ環境・同じ保存経路**で、最後の失敗より後に保存の成功が観測された状態。実際の復旧の判定条件。staging など別の環境での成功は含めない
- **Recovery_Unverified**: Observed_Clear だが、Verified_Recovery をまだ確認できていない状態。runbook 上の正式な状態として扱う
- **Operation_Id**: 利用者の送信操作 1 件に対してフロントエンドが発行する ID。リトライの全試行で共通。試行番号（Attempt、1 始まり）と組で送る
- **Backend_Sampling**: バックエンド（save-chat / okiraku-api）でトレースを記録するかの判断。初期版は、親の sampled フラグにかかわらず全件記録に固定する
- **Trial_Period**: 導入後の試験期間（14 日）。データ量・性能・誤報率を実測する期間

## Requirements

### Requirement 1: 事前検証（Spike）

**User Story:** 開発者として、実装に入る前に実行環境で動くことと伝播が通ることを確認したい。前提が崩れた部分だけ設計を切り替えられるようにするため。

#### Acceptance Criteria

1. THE Spike SHALL Supabase Edge Runtime 上で `@opentelemetry/api` と `@opentelemetry/sdk-trace-base`（npm: 指定）の初期化・スパン作成・OTLP/HTTP 送信が動作するかを検証し、結果を design.md に記録する
2. THE Spike SHALL Supabase Edge Runtime で `AsyncLocalStorage` ベースの Context Manager が `await` および `EdgeRuntime.waitUntil` をまたいで Context を保持するかを検証する。結果にかかわらず、本番実装は Requirement 3.2 の明示的な受け渡しを採用する
3. THE Spike SHALL ブラウザから `https://<ref>.supabase.co/functions/v1/save-chat` へ送った `traceparent` / `tracestate` が API Gateway を通過して関数に届くことを確認する
4. THE Spike SHALL Browser_Agent が付与した `traceparent` を save-chat が親として採用し、New Relic 上で Browser の AJAX スパンと save-chat スパンが親子として表示されることを確認する
5. THE Spike SHALL supabase-js の `functions.invoke` と `from().insert()` が、Browser_Agent によるラップ後の `fetch` を通ることを確認する（ヘッダーが付かない場合は付与方法を design.md に追記する）
6. WHEN AC 1 が失敗した場合, THE Spike SHALL 代替として最小実装の OTLP/HTTP JSON エクスポーター（手書き）の採否を判断し、判断理由を記録する
7. THE Spike SHALL okiraku-api の Vercel Functions で OTel SDK を初期化し、`waitUntil` による flush で応答後にスパンとログが届くことを確認する
8. THE Spike SHALL save-chat のコールドスタート時間と通常時の応答時間を、計測なし／計測ありでそれぞれ 30 回以上測定し、中央値と p95 を記録する（Requirement 9 の基準値）

### Requirement 2: okiraku-api `/evaluate` の計測

**User Story:** 運用者として、評価 API の処理時間・失敗・AI 呼び出し時間を、呼び出し元 save-chat のトレースの続きとして見たい。

#### Acceptance Criteria

1. WHEN `/api/v1/evaluate` がリクエストを受けたとき, THE okiraku-api SHALL 受信した `traceparent` を親としてサーバースパンを作成する（`traceparent` がない場合は新しいトレースを開始する）
2. THE okiraku-api SHALL `experimental_evaluate` の呼び出しを Evaluate_Span で囲み、処理時間・成功／失敗・`preset`・`model`（`EVALUATION_MODEL`）を属性として記録する
3. WHERE `result.usage.inputTokens` / `outputTokens` / `totalTokens` が数値として返された場合, THE Evaluate_Span SHALL その値だけを属性として記録する。値が `undefined` の属性は付けず、0 として扱わない
4. THE okiraku-api SHALL `experimental_telemetry` を前提とした自動計測を使わない（`ai@7.0.105` の `evaluate` は同オプションを受け取らないため）
5. WHEN 評価が失敗したとき, THE Evaluate_Span SHALL ステータスを ERROR にし、既存の `HttpError.code`（`EVALUATION_TIMEOUT` / `EVALUATION_FAILED` 等）を `error.code` として記録する。SDK の生エラーメッセージは記録しない
6. THE okiraku-api SHALL 評価対象の本文（`state` / `question` / `userMessage` / `assistantMessage` / `options`）と Authorization ヘッダーをスパン・ログのどちらにも記録しない

### Requirement 3: save-chat の計測と非同期処理の追跡

**User Story:** 運用者として、save-chat の DB 保存時間・失敗と、応答後に動く triage を同じトレースで見たい。

#### Acceptance Criteria

1. WHEN save-chat がリクエストを受けたとき, THE save-chat SHALL 受信した `traceparent` から Request_Context を作り、サーバースパン `POST save-chat` を開始する
2. THE save-chat SHALL Request_Context を関数引数として `triageAdminChat` 以下へ明示的に渡し、子スパンの作成と送信ヘッダーへの `traceparent` 注入にその Context を使う。`context.active()` の暗黙的な値には依存しない
3. THE save-chat SHALL `chats` への insert、triage のレート制限 select、管理人返信の insert をそれぞれ DB スパンとして記録する（`db.system.name=postgresql`、`db.operation.name`、`db.collection.name=chats`、処理時間、成功／失敗）
4. THE save-chat SHALL `/evaluate` と GitHub Issues API への送信をクライアントスパンとして記録し、`/evaluate` への送信には Request_Context 由来の `traceparent` を付ける。GitHub への送信には `traceparent` を付けない
5. THE triage のスパン SHALL save-chat サーバースパンと同じ trace ID を持ち、save-chat サーバースパンを親（または祖先）とする
6. WHEN 同時に 2 件以上のリクエストを処理したとき, THE save-chat SHALL 各リクエストのスパン（triage を含む）をそれぞれのトレースにだけ属させる
7. THE save-chat SHALL 正常応答・早期 return（400 / 405 / 500）・例外のすべての経路で、サーバースパンを終了してから応答を返す時点で 1 回目の Telemetry_Flush を `EdgeRuntime.waitUntil` に登録する。triage がある場合は、triage が成功・reject・期限切れのどれで終わっても `finally` で triage スパンを終了し、2 回目の Telemetry_Flush を行う（triage が止まっても、終了済みの保存スパンは 1 回目で送れる）
8. THE save-chat SHALL トレースとログを別々に flush し、どちらかの flush が失敗・タイムアウトしても、もう片方の flush とチャットの保存結果・応答に影響させない
9. WHEN OTLP_Endpoint への送信が失敗したとき, THE save-chat SHALL 失敗をチャット処理の失敗として扱わず、応答ステータスを変えない
10. THE triage SHALL 全体の期限（初期値 45 秒）を持ち、期限を超えたら中断して、triage スパンを ERROR（`error.code = 'triage_deadline'`）で終了する。`EdgeRuntime.waitUntil` は Edge Function の実行時間の上限を延長しないため、2 回目の flush はこの期限内に終える
11. THE save-chat と okiraku-api SHALL Backend_Sampling を全件記録（`AlwaysOn`）に固定する。受信した `traceparent` の親 ID は引き継ぐが、sampled フラグが `00` でも記録する
12. WHEN リクエストに Operation_Id と Attempt のヘッダーがあるとき, THE save-chat SHALL サーバースパンと DB スパンに `chat.operation.id` / `chat.attempt` として記録する。ヘッダーがない場合は、サーバー側で生成した値を `chat.operation.id` に入れ、`chat.operation.id_source = 'server'` を付ける

### Requirement 4: エラー情報と個人情報の扱い

**User Story:** 運用者として、監視データから利用者の個人情報や外部サービスの応答本文が漏れないようにしたい。

#### Acceptance Criteria

1. THE 全コンポーネント SHALL スパン属性・スパンイベント・ログに Error_Summary 以外のエラー情報を記録しない。DB エラーは PostgREST の `code`（例: `23505`）・`error.message`（先頭 500 文字）・処理名を記録してよい。HTTP 送信エラー（JEV・GitHub・OTLP）はステータスコードと処理名のみを記録し、応答本文は記録しない
2. THE 全コンポーネント SHALL 発言本文・名前・メールアドレス・IP・User-Agent・`metadata` を記録しない
3. ~~THE triage.ts SHALL 例外メッセージに外部応答本文を含めない形に変更する~~ **取りやめ**（2026-09-22。匿名チャットで個人情報を含まないため。PR #120 はクローズ）。ただし例外メッセージをスパンやログに送るときは、R4.1 のとおり HTTP 応答本文を含めない
4. ~~THE save-chat SHALL クライアントへ返すエラー文に DB の `error.message` を含めない~~ **取りやめ**（2026-09-22、R4.3 と同じ理由）。クライアントへの応答は現行のままとし、trace ID の返却だけ追加を検討する
5. THE Browser_Agent SHALL 初期導入では Session Replay を無効にする
6. THE Browser_Agent SHALL 送信先 URL のクエリ文字列を記録しない設定にし、`newrelic.log()` / `setCustomAttribute()` には Requirement 4.2 の項目を渡さない
7. THE 導入 PR SHALL ステージングで送信操作を行い、New Relic に実際に届いた `Span` / `Log` / `AjaxRequest` / `JavaScriptError` / `BrowserInteraction` の全属性を NRQL で一覧化し、Requirement 4.1〜4.2 の項目が含まれないことを確認した結果を PR に記載する（受け入れ条件）

### Requirement 5: Browser 監視とクロスドメイン伝播

**User Story:** 運用者として、利用者の「送信」操作から save-chat までを同じトレースで見たい。

#### Acceptance Criteria

1. THE Browser_Agent SHALL `distributed_tracing.enabled: true`、`cors_use_tracecontext_headers: true`、`cors_use_newrelic_header: false`、`allowed_origins: ['https://<ref>.supabase.co']` で設定する
2. THE Browser_Agent SHALL `allowed_origins` 以外（GA4、`api.okiraku.chat` など）へは追跡ヘッダーを付けない
3. THE save-chat SHALL CORS 事前確認で `traceparent` と `tracestate` を許可する（現行の `Access-Control-Request-Headers` 反映方式で満たされることを Requirement 1.3 で確認し、満たされない場合は明示的に追加する）
4. THE Browser_Agent SHALL SSR / 事前レンダリング（`entry-server.tsx`、`prerender:rooms`）とテスト環境では初期化しない
5. WHEN 利用者が発言を送信したとき, THE フロントエンド SHALL その操作を `send-chat` という名前のインタラクションとして記録する
6. THE フロントエンド SHALL Browser_Agent の読み込み方法（同期 / 遅延）とバンドル増分を design.md に記録し、既存の SPA パフォーマンス目標との差を計測する
7. WHERE 送信者が自分の発言を Realtime で受信した場合, THE フロントエンド SHALL 既存の `metadata.optimisticNonce` を使って送信から受信までの時間を `realtime_echo_ms` として記録できる（任意機能。Phase 5 で判断）
8. WHEN 利用者が発言を送信したとき, THE フロントエンド SHALL 送信操作 1 件ごとに Operation_Id を発行する。`retryApiCall` の各試行では、同じ Operation_Id と 1 から始まる Attempt を、save-chat へのヘッダー（`x-chat-operation-id` / `x-chat-attempt`）で送る。Browser_Agent の AJAX 記録にも同じ値を付ける
9. THE 設計 SHALL 試行ごとに Browser の trace ID が変わることを前提とし、1 操作の全試行を Operation_Id で束ねる

### Requirement 6: 構造化ログ（pino）

**User Story:** 運用者として、トレースから該当ログへ、ログからトレースへ移動したい。

#### Acceptance Criteria

1. THE okiraku-api SHALL pino で構造化ログを出力し、既存の `log` 関数（`console.info(JSON.stringify(...))`）を置き換える。既存の出力項目（`event` / `requestId` / `status` / `durationMs`）は維持する
2. THE okiraku-api SHALL `LoggerProvider`・OTLP ログエクスポーター・`BatchLogRecordProcessor` を登録してから pino を生成する（初期化順序を守る）。ログの送信経路は `@opentelemetry/instrumentation-pino` を第一候補とし、ESM 環境で patch が効かない場合は pino の出力を OTel Logs API へ渡す手動ブリッジを使う（Spike で判断）
3. THE ログ SHALL アクティブなスパンがある場合に `trace_id` / `span_id` / `trace_flags` を含む
4. THE okiraku-api SHALL pino の transport（worker thread）を使わない
5. THE save-chat SHALL pino の導入を必須としない。pino が Edge Runtime で動作しない場合は、同じ項目名（`level` / `msg` / `event` / `trace_id` / `span_id`）を出す軽量ロガーを使う
6. WHERE LoggerProvider を登録しない構成の場合, THE okiraku-api SHALL `disableLogSending: true` を設定し、不要なログ変換処理を行わない

### Requirement 7: アラートと PagerDuty 通知

**User Story:** 運用者として、本当に対応が必要な異常だけを PagerDuty で受け取り、復旧時は自動で解決されるようにしたい。

#### Acceptance Criteria

1. THE 各アラート条件 SHALL 集計窓（window）・発報継続時間（threshold duration）・データなし時の扱い（gap filling / loss of signal）・クローズ条件を design.md の条件表に明記する
2. THE Paging_Condition SHALL 初期版ではサーバー側の保存失敗（save-chat の DB insert エラー）を主条件とする。件数の単位は HTTP の試行数ではなく、**保存に失敗した試行を 1 回以上含む Operation_Id の数**とする。また、同じ障害で save-chat 5xx・Browser 側の失敗が重複して PagerDuty に通知されないようにする（後者は New Relic 内の Warning として扱う）
3. WHERE アクセスがない時間帯の場合, THE エラー件数条件 SHALL gap filling の固定値 0 で評価する。Loss of Signal では新しく発報せず、開いているインシデントを閉じる設定にする。アクセスがある時間帯は、エラー以外のスパンも集計の対象に含め、エラーがなければ値が 0 になるようにする
4. WHEN エラー件数条件がクローズ条件を満たしたとき, THE New Relic SHALL インシデントをクローズし、Workflow 経由で PagerDuty へ Resolve を送る
5. THE 運用手順 SHALL 自動クローズを Observed_Clear として扱い、Verified_Recovery とは区別する。Verified_Recovery は、障害と同じ環境・同じ保存経路での成功だけで判定する。確認できるまでは Recovery_Unverified として PagerDuty のインシデントに記録する。確認方法は runbook に記載する
6. THE パーセンタイル条件（p95）SHALL 集計窓内のリクエストが最低件数（初期値 5 件）未満の場合は評価しない
7. THE PagerDuty サービス SHALL Dynamic Notifications（severity に応じた緊急度）を有効にし、New Relic から `critical` / `warning` の severity を送る
8. THE 導入 SHALL 既存の HetrixTools 連携の通知（高緊急度・即時メール）が Dynamic Notifications 有効化後も変わらないことを確認する（HetrixTools が送る severity の値を確認する）
9. THE 導入 PR SHALL 故意の失敗注入で「発報 → PagerDuty 通知 → 復旧 → Resolve」までを実際に確認する。アクセスがある場合とない場合の両方で行い、発報とクローズの時刻を記録する
10. THE 各アラート条件 SHALL 次の設定値を固定し、design.md の条件表と実際の設定を一致させる：集計方式（まばらなデータ向けの Event timer とその timer 値）、集計窓、スライディングの間隔、threshold duration、評価の遅延
11. THE Paging_Condition SHALL Backend_Sampling が全件記録であることを前提にする。WHEN Backend_Sampling を全件記録から変えるとき, THE 変更 SHALL 先に Paging_Condition を、サンプリングに依存しない信号（保存結果のメトリクスなど）へ移す
12. THE ログに依存するアラート条件 SHALL そのログが New Relic に届いていることを確認してから有効にする

### Requirement 8: E2E トレース検証

**User Story:** 開発者として、トレースが「つながったように見える」ではなく、親子関係まで正しいことを確認したい。

#### Acceptance Criteria

1. THE E2E 検証 SHALL 1 回の送信操作について、Browser の `AjaxRequest`（または Browser スパン）・save-chat のサーバースパン・DB insert スパンが同じ `trace.id` を持つことを確認する
2. THE E2E 検証 SHALL `parent.id` をたどって「Browser 通信 → save-chat → DB insert」の親子関係が成立していることを確認する
3. WHEN 送信先が `com_sb` のとき, THE E2E 検証 SHALL 「save-chat → triage → /evaluate クライアントスパン → okiraku-api サーバースパン → Evaluate_Span」の親子関係と、triage と DB insert が同じ save-chat スパンの子孫であることを確認する
4. THE E2E 検証 SHALL 成功ケースに加えて、DB 保存失敗・/evaluate タイムアウト・OTLP 送信失敗（送信先を無効化）のケースで、期待するスパン状態と応答を確認する
5. THE E2E 検証 SHALL 同時に 2 件の送信を行い、各トレースに他方のスパンが混ざらないことを確認する
6. THE E2E 検証 SHALL NerdGraph の NRQL クエリで上記を判定するスクリプトとして実装し、繰り返し実行できるようにする
7. THE E2E 検証 SHALL 「初回の試行が失敗し、再試行で成功する」ケースで、同じ Operation_Id に Attempt 1（失敗）と Attempt 2（成功）のサーバースパンがあり、それぞれ別の trace ID を持つことを確認する
8. THE E2E 検証 SHALL Browser が `sampled=00` の `traceparent` を送った場合でも、バックエンドのスパンが記録され、C1 の対象になることを確認する

### Requirement 9: 性能とデータ量

**User Story:** 運用者として、計測の導入で利用体験とコストが悪化していないことを数値で判断したい。

#### Acceptance Criteria

1. THE save-chat SHALL 計測導入によるコールドスタート増加の仮目標を中央値 +50ms 未満とし、Requirement 1.8 の測定条件（リージョン・回数・ペイロード）で比較する。仮目標を超えた場合は Trial_Period 内に採否を判断する
2. THE save-chat SHALL 通常時（ウォームスタート）の p95 応答時間の増加を +20ms 未満とする（仮目標）
3. THE Trial_Period SHALL 実測したデータ量（Span / Log / Browser イベント別、GB/日）から月間量を推定し、New Relic 無料枠（月 100GB）に対する割合を記録する
4. THE 導入 SHALL 全区間・全件の保存を保証しない。月間推定が無料枠の 50% を超えた場合は、サンプリングまたは収集項目の削減を決める
5. THE Trial_Period SHALL Supabase Edge Functions の呼び出し回数・実行時間・通信量の増分を記録する

### Requirement 10: DB 監視（段階導入）

**User Story:** 運用者として、DB 内部の状態も最終的には把握したいが、初期導入の複雑さとコストは抑えたい。

#### Acceptance Criteria

1. THE 初期導入 SHALL DB の監視を save-chat の DB スパン（Requirement 3.3）と Supabase ダッシュボード（Reports / Query Performance）で行い、定期実行の DB メトリクス収集を含めない
2. WHERE supabase-js を 2.106.0 以上に更新する場合, THE save-chat SHALL `tracePropagation` を有効にし、PostgREST へのリクエストの trace ID を Supabase の API Gateway ログで検索できることを確認する（任意。Phase 5）
3. WHERE DB メトリクス収集を追加する場合, THE 設計 SHALL 認証と最小権限・前回値との差分計算・統計リセットの検知・クエリ本文の除外・収集自体の失敗監視・Supabase 側の呼び出し回数と費用を別 spec で定義する

## Non-Goals

- Browser から OTLP へ直接送信すること（ライセンスキーの公開または中継サーバーが必要なため）
- Supabase Postgres 内部（実行計画・ロック待ち）へのトレース伝播
- Realtime（WebSocket）配信区間のトレース伝播（Requirement 5.7 の計測値で代替）
- Session Replay の導入（初期版では無効。別途判断）
- 初期版での DB メトリクス定期収集（Requirement 10.3 の別 spec）
- HetrixTools 監視の置き換え（外形監視は継続する）

## Success Metrics

- ステージングで `com_sb` への送信 1 件について、Requirement 8.1〜8.3 の親子関係を NRQL スクリプトで自動判定できる
- 故意の DB 保存失敗で PagerDuty に 1 件だけ通知され、失敗解消後に自動で Resolve される
- Trial_Period の実測で、New Relic の月間推定データ量が無料枠の 50% 未満
- 送信経路の p95 応答時間の増加が +20ms 未満、コールドスタート中央値の増加が +50ms 未満（仮目標）
- Requirement 4.7 の属性一覧に PII 項目が含まれない
