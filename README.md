/_ eslint-disable _/

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x';
import reactDom from 'eslint-plugin-react-dom';

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
});
```

## Supabase Configuration

This project saves chat logs to Supabase. Create a `.env` file based on `.env.example` and provide your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values.

### `save-chat` Edge Function

Chat messages are **not** inserted directly from the client. All inserts go through the
`save-chat` Edge Function (`supabase/functions/save-chat`), which derives `ip` / `ua` from request
headers server-side so they are tamper-proof. The client (and `pnpm dev`) will fail with
`Failed to send a request to the Edge Function` until this function is deployed to the project that
`VITE_SUPABASE_URL` points to:

```bash
supabase functions deploy save-chat
```

Deploying the function alone is safe and has no effect on existing clients. Locking down direct
INSERT via RLS is a separate, later step — see
[docs/save-chat-edge-function.md](docs/save-chat-edge-function.md) for the full staged rollout
(function deploy → client deploy → RLS migration) and the rationale.

## 監視・障害通知

公開サイト `https://www.okiraku.chat/` を **HetrixTools Free** で外形監視し、
**PagerDuty Free** を通じて担当者へメール通知する（2026-09-22 設定）。
設定は各サービスの管理画面に保存されており、アプリ側の環境変数や追加プロセスは不要。

```text
https://www.okiraku.chat/
  ← HetrixTools が1分間隔でHTTPS GET
  → 障害・復旧イベントをPagerDutyへ送信
  → PagerDutyが担当者へ障害通知メールを送信
```

### 監視条件

| 項目 | 設定 |
| --- | --- |
| 監視名 | `okiraku.chat` |
| URL | `https://www.okiraku.chat/`（`www` あり） |
| 方法・間隔 | HTTPS GET、1分間隔 |
| 拠点 | 東京、シンガポール、サンフランシスコ、アムステルダム |
| 正常なHTTPステータス | `200` |
| タイムアウト | 10秒 |
| リダイレクト | 最大5回まで追跡 |
| 再試行 | 各拠点で3回 |
| 障害・復旧判定 | 4拠点中3拠点（過半数）が状態変化を確認 |
| 通知タイミング | 障害判定後、追加の待機時間なし |
| SSL | 証明書の有効性とホスト名を検証 |
| 通知リスト | HetrixToolsの`Default Contact` |

1分間隔はチェックの周期であり、通知までの時間を保証するものではない。
再試行や複数拠点での判定、通知処理に時間がかかる場合がある。
この監視は公開ページのHTTP応答を確認するもので、ブラウザーでの描画、
チャット送受信、Supabaseや`save-chat` Edge Functionの正常動作までは検証しない。

### PagerDuty連携

- サービス名：`okiraku.chat`。エスカレーションポリシーは`Default`。
- 連携名：`HetrixTools - okiraku.chat`。
  [HetrixTools公式手順](https://docs.hetrixtools.com/pagerduty-integration/)に従い、
  連携タイプは`API Fortress Connector`を使用する。
- この連携のIntegration Keyを、HetrixToolsの
  **Contact Lists → Default Contact → PagerDuty** に保存する。
- 障害時はHetrixToolsがインシデントを作成し、PagerDutyが高緊急度として
  担当者の登録済みメールアドレスへ即時通知する。電話・SMS・モバイルPushは未設定。
- 復旧時はHetrixToolsが対応するインシデントを解決する。
  PagerDuty側の時間経過による自動解決は無効。
- 初期設定で作成したEmail連携は未使用。監視イベントは専用のAPI連携を通る。

Integration Keyや通知先メールアドレスは、README・ソースコード・公開Issueへ記載しない。
キーはPagerDutyとHetrixToolsの管理画面で管理する。

### 動作確認・再テスト

1. HetrixToolsの監視レポートで`Online`と4拠点のチェック結果を確認する。
2. **Contact Lists → Default Contact → PagerDuty** のキーを保存したうえで、
   **Send test notification** を実行する。
3. PagerDutyの`okiraku.chat`サービスに
   `This is a test PagerDuty notification.` が作成されたことを確認する。
4. インシデントの**Timeline**でメール通知履歴を確認し、受信箱でも着信を確認する。
5. テストインシデントを**Resolve**して終了する。

2026-09-22に4拠点での`Online`、テストイベントの受信、PagerDutyのメール通知履歴を確認済み。
テストインシデントは手動で解決済み。実際の障害・復旧による自動解決は未テスト。

### 無料運用の条件

- HetrixTools Freeは15監視まで、1分間隔の監視とPagerDuty連携に対応。
  **少なくとも90日に一度ログイン**し、アカウントをアクティブに保つ。
- PagerDutyはトライアルではなくFreeプラン（月額$0）に切り替え済み。
  この構成では1サービス・1エスカレーションポリシーとメール通知を使用する。
- 各サービスの提供条件は変更される可能性があるため、運用変更時に公式情報を確認する。

参照：[HetrixTools料金表](https://hetrixtools.com/pricing/uptime-monitor/)、
[無料アカウントの継続条件](https://docs.hetrixtools.com/free-accounts-inactivity/)、
[PagerDuty料金表](https://www.pagerduty.com/pricing/incident-management/)。

## Styling Notes

- The root `main` element owns the viewport height via `min-h-dvh`; descendant panes should rely on flex sizing plus `overflow-y-auto` instead of duplicating `min-height` styles.
- Layout containers apply horizontal padding once with `px-[var(--page-gap)]`. Any child that needs to span edge to edge should add the `bleed-x` utility class.
- Design tokens (brand colors, IE-inspired grays, and the retro font stack) live in `src/styles/theme.css`, making classes like `bg-yui-green`, `border-ie-gray`, and `font-yui` available across the app.
