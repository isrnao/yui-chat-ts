# お気楽チャットTS

「放課後学生タウン」の雰囲気を再現した、登録不要のブラウザベース・リアルタイムチャットです。通常チャット、全部屋表示、Chanariなりきりチャット、ルーム一覧を提供します。

- 公開サイト: <https://www.okiraku.chat/>
- フロントエンド: React 19 / TypeScript 6 / Vite 8
- データ・Realtime・Edge Function: Supabase
- 公開: GitHub Pages（独自ドメイン）
- 外部評価API: `https://api.okiraku.chat`（別のVercelプロジェクト）

## システム構成

```text
Browser
  ├─ GitHub Pages ── HTML / JS / CSS（SSG済みページはhydrate）
  ├─ Supabase
  │    ├─ PostgREST ── ログ取得・論理削除・ランキング
  │    ├─ Realtime ── 新着INSERT / look・unlook broadcast
  │    └─ save-chat Edge Function ── service_roleでchatsへINSERT
  │           └─ 管理者チャットだけバックグラウンドtriage
  │                ├─ Okiraku API（Vercel）── 発言分類
  │                └─ GitHub API ── 機能要求Issue作成
  ├─ GA4 / Google Tag Manager ── 利用イベント
  ├─ New Relic Browser ── Ajax・JS Error・Page View等
  └─ X widgets / intent ── タイムライン埋め込み・共有

HetrixTools ── www / API healthを外形監視 ── PagerDuty
save-chat / Okiraku API ── OTLP ── New Relic ── PagerDuty（重大アラート）
Storybook ── GitHub Actions ── Chromatic
```

### ソースコードのレイヤー

| パス                            | 責務                                                  |
| ------------------------------- | ----------------------------------------------------- |
| `src/routes/`                   | URL解決後のroute wrapper                              |
| `src/features/chat/`            | 通常チャット、全部屋、API、Realtime、ログストア、設定 |
| `src/features/chanari-chat/`    | Chanari専用UI、設定、ルーム別下書き                   |
| `src/features/top/`             | トップ、ルーム一覧、参加人数、X埋め込み               |
| `src/pages/`                    | ページレベルのview                                    |
| `src/shared/`                   | 共通UI、hooks、Supabase client、分析・監視            |
| `supabase/functions/save-chat/` | 保存、サーバー観測値、triage、OTLP telemetry          |
| `supabase/migrations/`          | DB schema、RLS、view、生成列                          |
| `scripts/`                      | sitemap、SSG、New Relic設定、smoke test               |

詳細は[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)を参照してください。

### ルーティングと配信

React Routerには依存せず、`src/routes/resolveRoute.ts`でpathnameを解決します。

| URL                | 画面                                       |
| ------------------ | ------------------------------------------ |
| `/`                | トップ                                     |
| `/chat`            | `/chat/superbeginner`へ置換リダイレクト    |
| `/chat/:roomId`    | 通常チャット（`all`は全部屋）              |
| `/chanari`         | `/chanari/superbeginner`へ置換リダイレクト |
| `/chanari/:roomId` | Chanari                                    |
| その他             | 404                                        |

トップだけを静的importし、Chat／AllRooms／Chanari／404をroute単位で`React.lazy`します。公開ビルドはトップと全ルームを事前レンダリングし、`data-ssg="1"`のHTMLをブラウザでhydrateします。GitHub Pagesへのdeep linkは`public/404.html`と`index.html`の復元処理で扱います。

## チャットのデータフロー

### 保存

1. クライアントが楽観的な発言を即時表示します。
2. `supabase.functions.invoke('save-chat')`を呼びます。クライアントから`ip`／`ua`は送りません。
3. Edge Functionがproxy経由のリクエストheaderからIP、`user-agent`からUAを観測します。
4. Edge Functionだけが`service_role`で`chats`へINSERTし、確定したUUID v7、時刻、`ip_masked`、UAを返します。
5. クライアントが楽観行を確定行へmergeします。失敗時は指数バックオフで最大3回試行します。
6. INSERTはSupabase Realtimeの`postgres_changes`で同じroomのクライアントへ配信されます。

`ip`／`ua`は「クライアントpayloadでは指定できないサーバー観測値」です。headerの信頼境界はSupabase Edgeのproxy処理に依存するため、「改ざん不可能」とは扱いません。ブラウザへ生IPは返さず、DB生成列の`ip_masked`を表示に使います。

直接INSERTを許可しないRLS migrationは`supabase/migrations/20250619000000_lock_insert_to_service_role.sql`にあります。migrationがリポジトリに存在することと本番DBへの適用済みであることは別なので、デプロイ時はSupabaseのmigration historyも確認してください。匿名チャットのため`save-chat`のJWT検証は無効ですが、ブラウザにはanon keyだけを配り、service role keyは配りません。

### 取得・Realtime・削除

- 取得・Realtime 購読・取り直しは room 単位の外部ストア（`roomLogStore.ts`）が持ち、`useSyncExternalStore` で読みます。画面遷移は全ページ読み込みなので、ページをまたぐキャッシュは持ちません。
- 新着はroom別Postgres Changes channel、look／unlookはroom別Realtime broadcast channelを使います。同じroomの購読者はchannelを共有します。
- Realtimeの接続状態を追跡し、切断中は再取得で欠落を補います。
- オフラインまたは認証系エラー時はmock dataへフォールバックします。
- 削除は`deleted = true`とする論理削除です。
- 発言ランキングは`chat_ranking` viewで全期間を集計します。

### ブラウザ内の保存データ

通常チャットの名前、色、メールアドレス、表示行数、アバター、訪問回数、前回／今回ログイン時刻を`localStorage`へ保存します。訪問回数のセッション内重複加算防止には`sessionStorage`を使います。Chanariはroom別の下書きも`localStorage`へ保存します。共有端末ではブラウザストレージにこれらが残る点に注意してください。

## セットアップ

### 必要環境

- Node.js: `>=20.19.0 <21`または`>=22.13.0`（`mise.toml`の推奨は22、CIは24）
- pnpm 10
- Edge Functionのローカル確認／デプロイ時: Supabase CLI、Deno、Docker

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`.env`へ実値を設定してください。未設定時も一部画面はfallbackで表示できますが、実際のチャット保存・Realtime・参加人数取得は利用できません。

## 環境変数とSecrets

`VITE_*`はクライアントbundleへ埋め込まれる**公開設定**です。秘密値を`VITE_*`にしないでください。ルート`.env`、Supabase Secrets、GitHub Actions Secrets、Vercel Environment Variablesは自動同期されないため、対象ごとに登録します。

| 変数                          | 配置先                               | 必須           | 公開区分・用途                           |
| ----------------------------- | ------------------------------------ | -------------- | ---------------------------------------- |
| `VITE_SUPABASE_URL`           | `.env`、GitHub Actions               | live接続時     | 公開。Supabase URL                       |
| `VITE_SUPABASE_ANON_KEY`      | `.env`、GitHub Actions               | live接続時     | 公開。anon key                           |
| `VITE_NEW_RELIC_ACCOUNT_ID`   | `.env`                               | Browser監視時  | 公開。Browser Agent設定                  |
| `VITE_NEW_RELIC_TRUST_KEY`    | `.env`                               | Browser監視時  | 公開。Browser Agent設定                  |
| `VITE_NEW_RELIC_AGENT_ID`     | `.env`                               | Browser監視時  | 公開。Browser Agent設定                  |
| `VITE_NEW_RELIC_BROWSER_KEY`  | `.env`                               | Browser監視時  | 公開用ingest key。server secretではない  |
| `VITE_NEW_RELIC_APP_ID`       | `.env`                               | Browser監視時  | 公開。Browser application ID             |
| `CHROMATIC_PROJECT_TOKEN`     | `.env`、GitHub Actions Secret        | Chromatic時    | 秘密。Storybook publish                  |
| `JEV_API_TOKEN`               | Supabase Secret                      | triage時       | 秘密。Okiraku API Bearer token           |
| `GITHUB_TOKEN`                | Supabase Secret                      | triage時       | 秘密。対象repoのIssues read/write PAT    |
| `NEW_RELIC_LICENSE_KEY`       | Supabase Secret、外部APIのVercel環境 | OTLP時         | 秘密。New Relic ingest license           |
| `NEW_RELIC_REGION`            | Supabase Secret、Vercel環境          | 任意           | `US`（既定）または`EU`                   |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Supabase Secret、Vercel環境          | 任意           | 既定OTLP endpointの上書き                |
| `DEPLOYMENT_ENVIRONMENT`      | Supabase Secret、Vercel環境          | 任意           | telemetryの環境名                        |
| `SAVE_CHAT_FAULT_INJECT`      | local／stagingのみ                   | 任意           | `attempt1`で初回失敗を注入。本番では無視 |
| `NEW_RELIC_USER_API_KEY`      | ローカル`.env`                       | alert管理時    | 秘密。NerdGraph操作                      |
| `PAGERDUTY_INTEGRATION_KEY`   | ローカル`.env`                       | 初回通知設定時 | 秘密。PagerDuty destination設定          |

SupabaseがEdge Functionへ自動提供する`SUPABASE_URL`と`SUPABASE_SERVICE_ROLE_KEY`は`.env.example`に置きません。`JEV_API_TOKEN`または`GITHUB_TOKEN`がない場合、発言保存は継続し、管理者チャットのtriageだけをskipします。New Relic関連がない場合も監視だけが無効になり、チャット機能は継続します。

## 開発コマンド

| コマンド               | 用途                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `pnpm dev`             | Vite開発サーバー                                           |
| `pnpm build`           | 型チェックを含むclient build                               |
| `pnpm build:prod`      | sitemap生成 → client build → SSR build → 全ルームprerender |
| `pnpm preview`         | build成果物の確認                                          |
| `pnpm typecheck`       | TypeScript型チェック                                       |
| `pnpm lint`            | ESLint                                                     |
| `pnpm format:check`    | Prettier確認                                               |
| `pnpm test`            | Vitestを1回実行（coverage 50% threshold）                  |
| `pnpm watch:test`      | Vitest watch                                               |
| `pnpm storybook`       | Storybook（port 6006）                                     |
| `pnpm build-storybook` | Storybook静的build                                         |
| `pnpm chromatic`       | Chromaticへpublish                                         |
| `pnpm lighthouse:*`    | 公開サイトのLighthouse計測                                 |
| `pnpm deploy`          | `build:prod`後、`gh-pages -d dist`で公開                   |

## ビルド・CI・デプロイ

### フロントエンド

`pnpm build`は通常のclient buildです。公開時は`pnpm build:prod`が次を順に行います。

1. `CHAT_ROOM_IDS`から`public/sitemap.xml`を生成
2. TypeScriptとclient assetsを`dist/`へbuild
3. `src/entry-server.tsx`を`dist-ssr/`へSSR build
4. トップ、通常チャット、Chanariの全対象URLを静的HTML化

`pnpm deploy`はnpm lifecycleの`predeploy`として`build:prod`を実行し、`dist/`をGitHub Pagesへ送ります。フロントエンドのGitHub Pages公開workflowはなく、現在はこのコマンドによるデプロイです。

### GitHub Actions

- `.github/workflows/ci.yml`: pull requestでNode 24／`pnpm test`を実行します。現状は`continue-on-error: true`で、lint、typecheck、buildは実行しない非gatingチェックです。
- `.github/workflows/chromatic.yml`: `main`／`develop`へのpushとpull requestでStorybookをbuildし、Chromaticへpublishします。`CHROMATIC_PROJECT_TOKEN`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`をGitHub Actions Secretsへ登録します。

## 外部システムと送信データ

| システム          | 接続元・目的                          | 送信される主なデータ                                                                                              |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Supabase          | Browser／Edge。DB、Realtime、Function | 発言、名前、色、任意メール、metadata。EdgeがIP／UAを観測                                                          |
| Okiraku API       | `save-chat`の管理者チャットtriage     | 管理者チャットの発言本文、分類preset、W3C `traceparent`                                                           |
| GitHub API        | 機能要求と判定した発言のIssue化       | 発言本文、投稿者名、発言UUID、判定確率。`@mention`は無効化                                                        |
| GA4 / GTM         | Browser利用計測                       | room ID／title、イベント種別、文字数、経過時間等。本文、表示名、メール、任意URLは送らない                         |
| New Relic Browser | Browser監視                           | Page View、Ajax、JS Error、soft navigation、generic event、操作ID。cookies有効、Session Replay／Session Trace無効 |
| New Relic OTLP    | Edge／外部API監視                     | trace、span、構造化ログ。発言本文、名前、IP、UA、metadataは送らない                                               |
| X                 | トップのtimeline／共有                | `platform.twitter.com/widgets.js`および`x.com/intent/tweet`へのブラウザ通信                                       |
| Chromatic         | Storybook visual review               | Storybook buildとGit metadata。利用者のproduction chat dataは送らない                                             |
| HetrixTools       | 外形監視                              | 公開URLへのHTTPS GET結果                                                                                          |
| PagerDuty         | 障害通知                              | HetrixTools／New Relicの障害・復旧イベント                                                                        |

管理者チャットのうち、非system・1000文字以下の発言だけを分類します。`cr`確率0.5以上かつ直近1時間に3件未満の場合、GitHub Issueを作り、管理人の受付発言をチャットへ保存します。GitHub Issueの公開範囲と保存期間は対象GitHub repositoryの設定に従います。

GA4測定IDは`G-S3LCSTZBES`です。`gtag.js`はwindow loadまたは3秒後の早い方で読み込みます。分析イベントの契約は`src/shared/utils/analytics.ts`、測定方針は[`docs/ANALYTICS_MEASUREMENT_PLAN.md`](docs/ANALYTICS_MEASUREMENT_PLAN.md)を参照してください。

New Relic Browser Agentは、必要な全`VITE_NEW_RELIC_*`がある場合だけ、最初の操作またはloadから10秒後の早い方でidle loadします。送信操作IDをBrowser interactionと`save-chat` requestで共有し、分散traceを関連付けます。

## 監視・障害通知

以下の管理画面設定はリポジトリから現在値を検証できません。記載は**2026-09-22に確認した運用記録**であり、変更時はHetrixTools、PagerDuty、Vercel、New Relic、Supabaseの各管理画面で再確認してください。

### HetrixTools / PagerDuty

```text
https://www.okiraku.chat/
https://api.okiraku.chat/api/health
  ← HetrixToolsが1分間隔でHTTPS GET
  → 障害・復旧イベントをPagerDutyへ送信
  → PagerDutyが担当者へメール通知
```

| 項目                   | Web                                                  | API                                   |
| ---------------------- | ---------------------------------------------------- | ------------------------------------- |
| 監視名                 | `okiraku.chat`                                       | `okiraku-api health`                  |
| URL                    | `https://www.okiraku.chat/`                          | `https://api.okiraku.chat/api/health` |
| 正常条件               | HTTP 200                                             | HTTP 200かつ本文に`"status":"ok"`     |
| 間隔・方法             | HTTPS GET、1分                                       | 同左                                  |
| 拠点                   | 東京、シンガポール、サンフランシスコ、アムステルダム | 同左                                  |
| タイムアウト／redirect | 10秒／最大5回                                        | 同左                                  |
| 再試行／判定           | 各拠点3回、4拠点中3拠点の状態変化                    | 同左                                  |
| 通知                   | `Default Contact`のPagerDuty連携                     | 同左                                  |

APIの期待responseは`{"status":"ok","service":"okiraku-api"}`です。本文条件はJSON解析ではなく、大文字・小文字を区別する文字列一致です。Web監視はブラウザ描画やチャット送受信を、API health監視は`/api/v1/evaluate`やその依存先を保証しません。

- `www.okiraku.chat`: GitHub Pages（`isrnao.github.io`）
- `api.okiraku.chat`: Vercelの外部`okiraku-api` Production project
- PagerDuty service: `okiraku.chat`
- integration: `HetrixTools - okiraku.chat`（`API Fortress Connector`）
- 通知: 高緊急度メール。電話、SMS、mobile pushは未設定
- 復旧: HetrixToolsが対応incidentをresolve。時間経過による自動resolveは無効

Integration Keyと通知先メールアドレスはREADME、source、公開Issueへ書かず、管理画面で管理します。動作確認はHetrixToolsの4拠点、test notification、PagerDuty incident/timeline、メール着信、resolveの順で行います。2026-09-22時点でWeb／APIのOnlineとtest emailを確認済みですが、実障害による自動resolveとAPI専用障害テストは未実施です。

無料プランの条件は変更される可能性があります。運用変更時は[HetrixTools料金表](https://hetrixtools.com/pricing/uptime-monitor/)、[無料アカウントの継続条件](https://docs.hetrixtools.com/free-accounts-inactivity/)、[PagerDuty料金表](https://www.pagerduty.com/pricing/incident-management/)を確認してください。運用記録上、HetrixToolsは少なくとも90日に一度ログインしてアカウントをactiveに保ちます。

### New Relic

```text
save-chat（Supabase Edge Function）── OTLP/HTTP ─┐
  POST save-chat → db insert chats               │
  └ triage → Okiraku API ── traceparent ─────────┼→ New Relic
okiraku-api（Vercel）── OTLP/HTTP ────────────────┘      └→ C1のみPagerDuty
```

- `save-chat`は依存なしの自前tracer、Okiraku APIはOTel SDKを使います。
- US既定endpointは`https://otlp.nr-data.net`、EUは`https://otlp.eu01.nr-data.net`です。
- `NEW_RELIC_LICENSE_KEY`がない場合はtelemetryを送りません。
- NerdGraph操作は`https://api.newrelic.com/graphql`を使います。
- 設計・検証記録は`.kiro/specs/observability-new-relic/`にあります。

#### アラート

定義は`scripts/newrelic-alerts.ts`で管理します。

```bash
node --experimental-strip-types --env-file=.env scripts/newrelic-alerts.ts --apply
```

| ID  | 条件                                        | 通知先                |
| --- | ------------------------------------------- | --------------------- |
| C1  | 保存に失敗した送信操作が5分間に2件以上      | PagerDuty（critical） |
| C2  | `save-chat`の5xx（C1以外）が10分間に3件以上 | New Relicのみ         |
| C4  | 評価APIの502／504が15分間に3件以上          | New Relicのみ         |
| C5  | `save-chat`の2秒超が5%超（最低5件、15分）   | New Relicのみ         |
| C6  | 評価処理の6秒超が5%超（最低5件、15分）      | New Relicのみ         |
| C7  | `triage.failed`が60分間に1件以上            | New Relicのみ         |

#### C1 runbook

1. 次のNRQLでPostgREST error codeとmessageを確認します。

   ```text
   SELECT count(*) FROM Span WHERE service.name = 'save-chat' AND name = 'db insert chats' AND otel.status_code = 'ERROR' FACET db.response.status_code, error.message SINCE 30 minutes ago
   ```

2. incidentの自動closeは失敗が観測されなくなった`Observed_Clear`であり、復旧確認ではありません。利用者の送信がない場合もproductionから保存を試し、`Verified_Recovery`を確認します。未確認ならincidentへ`Recovery_Unverified`と残します。

   ```text
   SELECT latest(timestamp) FROM Span WHERE service.name = 'save-chat' AND name = 'db insert chats' AND otel.status_code != 'ERROR' AND deployment.environment.name = 'production' SINCE 1 hour ago
   ```

3. trace IDが分かる場合は保存から評価APIまでの親子関係を確認します。

   ```bash
   node --experimental-strip-types --env-file=.env scripts/verify-trace.ts --trace <traceId> --expect admin
   ```

#### `save-chat`のデプロイ

`save-chat`は現在の全クライアントの保存経路です。Functionだけの変更でも既存クライアントへ即時影響するため、次の順で確認します。

1. `deno test --allow-env --allow-read supabase/functions/save-chat/`
2. `bash scripts/smoke-save-chat-edge.sh`（Docker／Edge Runtime v1.76.0）
3. `supabase functions deploy save-chat`
4. productionへ名前なしPOSTを送り、`400 {"error":"name is required"}`を確認
5. production UIから保存し、Realtime反映と成功spanを確認

想定外のresponseや保存失敗があれば、直前のFunction versionを再デプロイします。RLS変更を伴う場合はFunction、client、migrationの互換性を個別に確認してください。

主な切り分け:

- OTLP 403: New Relicの`INGEST - LICENSE` keyか確認します。User／Browser keyは使えません。
- trace分断: Okiraku APIの`okiraku.traceparent_received`を確認します。comma区切りの場合は先頭値を使います。
- NerdGraph `ECONNRESET`: scriptは送信前にqueryの空白を正規化します。

## UI・スタイル規約

- root `main`が`min-h-dvh`でviewport高を所有し、子paneはflexと`overflow-y-auto`を使います。
- layoutの横paddingは`px-[var(--page-gap)]`で一度だけ付け、全幅要素は`bleed-x`を使います。
- 色とfont tokenは`src/styles/theme.css`に置き、`bg-yui-green`、`border-ie-gray`、`font-yui`等を使います。
- React Compilerを有効にしているため、新しい手動memoizationは原則追加しません。長いlistのcomponent境界として`ChatLogList`／`ChatMessage`の`memo`は維持します。

## 関連ドキュメント

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): 詳細設計
- [`docs/TEST_STRATEGY.md`](docs/TEST_STRATEGY.md): テスト方針
- [`docs/ANALYTICS_MEASUREMENT_PLAN.md`](docs/ANALYTICS_MEASUREMENT_PLAN.md): GA4測定方針
- [`docs/save-chat-edge-function.md`](docs/save-chat-edge-function.md): Edge Function導入時の段階的rollout記録。現行運用は本READMEを優先
- `.kiro/specs/observability-new-relic/`: New Relic設計・検証記録
