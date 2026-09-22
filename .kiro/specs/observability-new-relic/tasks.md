# 実装計画: observability-new-relic

## 概要

2 リポジトリ（yui-chat-ts / okiraku-api）と外部サービスの設定（New Relic / PagerDuty）にまたがる。
最初のマイルストーンは **「送信操作 1 件を最後まで追える」**（Phase 2 完了時点）。ここで効果・データ量・性能を判断してから Phase 3 以降に進む。

## 推奨実装順序（PR 単位）

1. **Phase 0 / PR0**: Task 0 (R1) — Spike。コードは検証用ブランチに置き、マージしない。結果は design.md に追記する
2. **Phase 1 / PR1（okiraku-api）**: Task 1 (R2, R4) — バックエンドの最小トレース（pino はまだ入れない）
3. **Phase 1 / PR2（yui-chat-ts）**: Task 2 (R3, R4) — save-chat のトレース、明示的な Context の受け渡し、flush、エラー文の修正
4. **Phase 2 / PR3（yui-chat-ts）**: Task 3 (R5, R4.5〜4.7) — Browser 監視とクロスドメイン伝播 → **マイルストーン: Task 4（E2E）で判定**
5. **Phase 3 / PR4（New Relic・PagerDuty の設定と README）**: Task 5 (R7) — アラート C1〜C6、発報・復旧テスト
6. **Phase 4 / PR5（okiraku-api / save-chat）**: Task 6 (R6, R7.12) — pino と OTLP ログ。ログが届くことを確認してから C7 を有効化する
7. **Phase 5（任意・別途判断）**: Task 7 (R5.7, R10) — `tracePropagation`、`realtime_echo_ms`、確認用プローブ、DB メトリクスの別 spec

Task 8 (R9) は Phase 1 から Trial_Period の終了まで続ける横断タスク。

## Tasks

- [ ] 0. Spike（Requirement 1）
  - [x] 0.1 Supabase Edge Runtime で OTel SDK が動くか検証する（ローカルと本番で完了。本番ではワーカーが毎回新しく起動し、SDK 一式で +144ms かかるため、**自前の軽量実装を採用**。design.md「本番 Spike」参照）
    - `npm:@opentelemetry/api`、`sdk-trace-base`、`exporter-trace-otlp-http` を deno.json の imports に追加し、スパン 1 件を New Relic に送る
    - 動かない場合は、手書きの OTLP/HTTP JSON エクスポーター（スパン型・ID 生成・JSON 化・fetch 送信）で同じことを行い、採用するか判断する
    - _Requirements: 1.1, 1.6_
  - [x] 0.2 Edge Runtime で AsyncLocalStorage が Context を保持するか検証する
    - `await` と `EdgeRuntime.waitUntil` をまたいで Context が保持されるか、同時 2 リクエストで混ざらないかを確認する（本番実装の採否には使わず、記録だけする）
    - _Requirements: 1.2_
  - [x] 0.3 Browser → save-chat の伝播を確認する（CORS と fetch の差し替えは確認済み。New Relic 上の親子関係は、内蔵ブラウザが bam.nr-data.net を止めるため、デプロイ後に確認）
    - `@newrelic/browser-agent` を検証用ブランチで有効にし、事前確認（プリフライト）の応答ヘッダー、関数が受け取る `traceparent`、`functions.invoke` がラップ後の fetch を通るかを確認する
    - `traceparent` の sampled フラグの比率を記録する
    - _Requirements: 1.3, 1.4, 1.5_
  - [x] 0.4 okiraku-api（Vercel）で OTel と `waitUntil` による flush を確認する（flush は本番で確認済み。`instrumentation-pino` の確認は Task 6 で行う）
    - `instrumentation-pino` が ESM で patch されるかもここで確認する
    - _Requirements: 1.7, 6.2_
  - [x] 0.5 性能の基準値を測定する（save-chat 側。本番で OTel なし 18ms / api だけ 41ms / SDK 一式 162ms。okiraku-api 側は Task 0.4 で測る）
    - 計測なし／ありで、save-chat のコールドスタートとウォーム時の応答時間を各 30 回以上測定する。測定手順はスクリプトにして残す
    - _Requirements: 1.8, 9.1, 9.2_
  - [ ] 0.6 design.md に Spike の結果と、採用した方式（SDK か手書きか、サンプリング、fetch の付け替えの要否）を追記する

- [ ] 1. okiraku-api のバックエンドトレース（Requirement 2, 4）
  - [x] 1.1 `src/shared/telemetry.ts` を作る
    - NodeTracerProvider、AsyncLocalStorageContextManager、W3C プロパゲーター、OTLP エクスポーターを設定する。環境変数がなければ no-op にする
    - _Requirements: 2.1_
  - [x] 1.2 `handler.ts` でサーバースパンを開始する
    - `propagation.extract` で受信した Context を取り出す。Options に `tracer` を追加する。status と `HttpError.code` を記録する
    - _Requirements: 2.1, 2.5_
  - [x] 1.3 Evaluate_Span（`evaluation.run`）を追加する（handler で `evaluate` を囲み、トークン数は `jev.ts` が有効なスパンに付ける。`Evaluator` の型は変えずに済んだ）
    - `Evaluator` の戻り値に `usage?` を追加し、数値のときだけトークン属性を付ける
    - _Requirements: 2.2, 2.3, 2.4_
  - [x] 1.4 `@vercel/functions` の `waitUntil` で flush する（ローカルと Vercel 本番の両方で New Relic に届くことを確認。okiraku-api PR #3 でマージ・デプロイ済み）
    - _Requirements: 1.7_
  - [x]\* 1.5 テストを追加する：`traceparent` の親子関係、usage が `undefined` か数値か、失敗時の属性、本文が記録されないこと
    - _Requirements: 2.1, 2.3, 2.5, 2.6_

- [ ] 2. save-chat のトレースと非同期処理の追跡（Requirement 3, 4）
  - [x] 2.1 ~~エラー文を修正する~~ **取りやめ**（2026-09-22、匿名チャットで個人情報を含まないため不要と判断。PR #120 はクローズ）
    - `triage.ts` の `JSON.stringify(body)` と `res.text()` を例外文から外す
    - `index.ts` の 500 応答を固定文言 + `requestId` に変える
    - フロントエンドがエラー文に依存していないか `chatApi.ts` で確認する
    - _Requirements: 4.3, 4.4_
  - [x] 2.2 `telemetry.ts` を作る（Task 0.1 で採用した自前の軽量実装。依存なしの Tracer・Span・traceparent・OTLP/HTTP JSON。ローカルから送ったスパンを New Relic が受け付けることを確認済み）
    - `startRequestTrace`、`startChildSpan`、`injectTraceHeaders`、`recordError`（Error_Summary だけを受け取る）、`flushAll`、`runTriage` を実装する
    - _Requirements: 3.1, 4.1_
  - [x] 2.3 ハンドラーを `handle(req, trace)` に分け、すべての return 経路と例外で、サーバースパンの終了 → 1 回目の `flushAll()` の順に処理する
    - flush は traces と logs で別々に、タイムアウト付き、`allSettled` で行う
    - Sampler は `AlwaysOnSampler` に固定する
    - _Requirements: 3.7, 3.8, 3.9, 3.11_
  - [x] 2.3a `runTriage` を実装する
    - triage 全体の期限は 45 秒。`finally` で triage スパンを終了し、2 回目の `flushAll()` を行う。各スパンの `span.end()` は design.md の表の位置に置く
    - _Requirements: 3.7, 3.10_
  - [x] 2.3b `x-chat-operation-id` / `x-chat-attempt` を検証してスパンに記録する。形式が不正、またはヘッダーがない場合は、サーバー側で生成する
    - _Requirements: 3.12_
  - [x] 2.4 DB スパンを追加する（insert chats / select count / insert reply）
    - _Requirements: 3.3_
  - [x] 2.5 triage の各関数に `ctx` 引数を追加する
    - `/evaluate` への送信には `traceparent` を付け、GitHub への送信には付けない
    - _Requirements: 3.2, 3.4, 3.5_
  - [x]\* 2.6 `deno test` を追加する
    - 同じ trace ID と親子関係
    - 同時 2 件で混ざらないこと
    - 各 return 経路で 1 回目の flush が登録されること
    - triage が reject・期限切れ・永久に解決しない場合でも、保存スパンが 1 回目の flush で送られること
    - `sampled=00` でも記録されること
    - 操作 ID ヘッダーの検証
    - エクスポーターが失敗しても応答が変わらないこと
    - 属性の許可リスト
    - _Requirements: 3.5, 3.6, 3.7, 3.9, 3.10, 3.11, 3.12, 4.1, 4.2_
  - [x] 2.7 staging とローカルだけで有効な故障注入フラグ（`SAVE_CHAT_FAULT_INJECT`）を追加する。production では無視する
    - _Requirements: 8.7, 7.9_

- [ ] 3. Browser 監視（Requirement 5, 4）
  - [x] 3.1 `src/shared/observability/newRelic.ts` を作る
    - 動的 import、`requestIdleCallback` での初期化、SSR・事前レンダリング・テストでは初期化しない判定、no-op のラッパーを実装する
    - _Requirements: 5.4_
  - [x] 3.2 分散トレーシングを設定する
    - `allowed_origins`、tracecontext ヘッダーだけを使う、Session Replay 無効、URL のクエリを記録しない
    - _Requirements: 4.5, 4.6, 5.1, 5.2_
  - [x] 3.3 送信処理に `send-chat` インタラクションを追加する（`useChatHandlers`）
    - _Requirements: 5.5_
  - [x] 3.3a `saveChatLogOptimistic` / `saveChatLog` で Operation_Id を発行する
    - `retryApiCall` から試行番号を受け取れるようにし、`x-chat-operation-id` / `x-chat-attempt` を送る
    - Browser Agent のカスタム属性にも付ける
    - _Requirements: 5.8, 5.9_
  - [x] 3.4 （不要だった。supabase-js は呼び出しのたびにグローバルの fetch を参照する）必要なら supabase-js の `global.fetch` を付け替え、save-chat の CORS に `traceparent` / `tracestate` を明示する（Task 0.3 の結果による）
    - _Requirements: 5.3_
  - [x] 3.5 （エージェントは gzip 後 50KB の遅延チャンク。エントリは変わらず。Lighthouse は未計測）バンドル増分と Lighthouse のスコアを計測し、design.md に記録する
    - _Requirements: 5.6_
  - [x]\* 3.6 Vitest を追加する
    - SSR で初期化されないこと
    - エージェントがなくても送信できること
    - リトライの全試行で同じ Operation_Id が送られ、Attempt が 1 ずつ増えること
    - _Requirements: 5.4, 5.8_

- [x] 4. E2E トレース検証（Requirement 8, 4.7）— マイルストーンの判定
  - [x] 4.1 `scripts/verify-trace.ts` を作る
    - NerdGraph で trace ID のスパンを取得し、`id` と `parent.id` から木を組み立てて、期待する木と照合する
    - _Requirements: 8.1, 8.2, 8.3, 8.6_
  - [x] 4.2 シナリオを実行する（本番では成功系と sampled=00・操作 ID を実施。失敗系・同時・再試行は故障注入が本番で無効なため deno test / node --test で確認。design.md「Task 4」参照）
    - 成功（通常ルーム / com_sb）
    - DB 保存失敗
    - /evaluate タイムアウト
    - OTLP 無効化
    - 同時 2 件
    - **初回失敗 → 再試行で成功**（Operation_Id で束ねて判定）
    - **`sampled=00`**
    - _Requirements: 8.4, 8.5, 8.7, 8.8_
  - [x] 4.3 New Relic に届いた全属性を NRQL で一覧化し、PII がないことを確認して PR に記載する
    - _Requirements: 4.7_
  - [x] 4.4 マイルストーンを判定する：追えたか、データ量、性能を見て、Phase 3 以降に進むか判断する（合格。バックエンド区間は本番で追える。月の見積もり約 1MB）

- [x] 5. アラートと PagerDuty（Requirement 7）
  - [x] 5.1 （連携は追加済み。Dynamic Notifications と HetrixTools の severity の確認は未実施）PagerDuty サービス `okiraku.chat` に New Relic 連携を追加し、Dynamic Notifications を設定する
    - HetrixTools のイベントの severity を確認する
    - _Requirements: 7.7, 7.8_
  - [x] 5.2 （scripts/newrelic-alerts.ts。C5/C6 は割合 × 最低件数の式に変更）C1〜C6 を NerdGraph（または Terraform）で作成する。**C7 は Task 6.5 で作成する**
    - 集計方式は Event timer（60 秒）、スライディングウィンドウ、gap filling = 0
    - Loss of Signal は、新しく発報せず、開いているインシデントを閉じる設定にする
    - C1 は失敗した操作の数（`uniqueCount(chat.operation.id)`）で数える
    - 設定値は design.md の条件表と一致させ、定義ファイルをリポジトリに置く
    - _Requirements: 7.1, 7.2, 7.3, 7.6, 7.10, 7.11_
  - [x] 5.3 （C1 だけを PagerDuty に送る。C4 は severity の変換を確かめるまで New Relic のみ）Workflow で C1 → PagerDuty（`critical`）、C4 → PagerDuty（`warning`）を設定し、クローズ時の通知を有効にする
    - _Requirements: 7.4_
  - [x] 5.4 （ローカルの alert-test で、アクセスがない場合を実測。アクセスがある場合は未実測）staging で失敗を注入して確認する
    - 発報 → 通知 → 解消 → Resolve の流れを、アクセスがある場合とない場合の両方で確認する
    - 発報とクローズの実測時刻で、design.md のタイムラインの例を更新する
    - HetrixTools への影響がないことを確認する
    - _Requirements: 7.9, 7.10_
  - [x] 5.5 README に runbook を追記する
    - Observed_Clear、Recovery_Unverified、Verified_Recovery の区別と、本番で確認する手順。staging での成功は根拠にしない
    - 時間上限や Loss of Signal によるクローズの扱い
    - _Requirements: 7.5_

- [x] 6. 構造化ログ（Requirement 6）
  - [x] 6.1 okiraku-api に LoggerProvider と OTLP ログエクスポーターを追加し、初期化順序を固定する
    - _Requirements: 6.2_
  - [x] 6.2 pino を導入し、`handler.ts` の `log` を置き換える（既存の項目は維持、transport は使わない、redact を設定）
    - _Requirements: 6.1, 6.3, 6.4, 6.6_
  - [x] 6.3 （自前の軽量ロガー Tracer.log）save-chat は、Edge で pino が動けば pino、動かなければ同じ項目名の軽量ロガーにする。`triage.failed` などのイベントを出す
    - _Requirements: 6.5_
  - [x]\* 6.4 テストを追加する：trace_id が付くこと、本文や Authorization が出ないこと
    - _Requirements: 6.3, 2.6_
  - [x] 6.5 `triage.failed` ログが New Relic に届くことを NRQL で確認してから、C7 を作成・有効化する（Task 5.2 と同じ共通設定を使う）
    - _Requirements: 7.12_

- [ ] 7. 任意の拡張（Requirement 5.7, 10）— Trial_Period の結果を見て判断する
  - [ ]\* 7.1 supabase-js を 2.106 以上に更新し、save-chat で `tracePropagation` を有効にして、API Gateway ログで trace ID を検索できるか確認する
    - _Requirements: 10.2_
  - [ ]\* 7.2 `realtime_echo_ms`（`optimisticNonce` を使う）
    - _Requirements: 5.7_
  - [ ]\* 7.3 Verified_Recovery 用の確認プローブを設計する（本文を保存しない方式）
  - [ ]\* 7.4 DB メトリクス収集の別 spec を作る（認証と最小権限、差分計算、統計リセット、クエリ本文の除外、収集失敗の監視、費用）
    - _Requirements: 10.3_

- [ ] 8. 性能とデータ量（Requirement 9）— 横断タスク
  - [ ] 8.1 各 Phase の後に性能を再測定する（Task 0.5 と同じ手順）
    - _Requirements: 9.1, 9.2_
  - [ ] 8.2 Trial_Period（14 日）で、データ量を種類別に日次集計して月間量を推定し、Supabase の呼び出し回数・実行時間・通信量の増分も記録する
    - _Requirements: 9.3, 9.4, 9.5_
