# Requirements Document: deps-modernization-vite8

## Introduction

ゆいちゃっとTS（yui-chat-ts）のビルド/開発ツールチェーンを 2026 年 5 月時点の最新安定版に揃える。主目的は次の 4 点である。

1. **本番ビルドと依存最適化の高速化**: Vite 8（Rolldown ベース）/ @vitejs/plugin-react / Vitest を Vite 8 対応版に上げる。
2. **フロントエンドランタイムの追従**: React 19.2 へ更新し、副作用処理・非表示 UI・プロファイリング改善の前提を整える（採用は別 spec）。
3. **データ層の安定化**: `@supabase/supabase-js` を 2.50 系から 2.105 系へ更新し、Realtime / Auth / Storage / Functions の安定化パッチと型推論改善を取り込む。
4. **型・Lint の整合性回復**: TypeScript 6.0 への更新と、`@typescript-eslint/*` (8.44.1) / `typescript-eslint` メタパッケージ (8.33.1) のバージョン不整合の解消。

現状の主要な前提・課題は以下の通り：

- 現行: `vite@6.3.5` / `@vitejs/plugin-react@4.5.1` / `vitest@3.2.3` / `storybook@9.1.8` / `@storybook/react-vite@9.1.8` / `react@19.1.0` / `react-dom@19.1.0` / `typescript@5.8.3` / `@supabase/supabase-js@2.50.x`（package.json 上は `^2.39.6`、lockfile では 2.50 系）/ `@typescript-eslint/eslint-plugin@8.44.1` / `@typescript-eslint/parser@8.44.1` / `typescript-eslint@8.33.1`。
- Node ランタイム: ローカルは `v22.20.0`。Vite 7 以降は **Node.js 20.19+ または 22.12+** が必須。Supabase JS も Node 18 サポート終了、2026-06-30 までに Node 22+ へ移行する方針が示されている。
- `vite.config.ts` で **`build.rollupOptions.output.manualChunks` を関数形式で使用**しており、Vite 8 では非推奨方向（object 形式は非対応、function 形式は deprecation 警告）。
- `vite.config.ts` で `cssMinify: 'lightningcss'` を既に指定済みのため、Vite 8 で `lightningcss` が optional peer から通常依存に昇格しても挙動は維持される。ただし install size は約 15MB 増える見込み（Lightning CSS +10MB / Rolldown binary +5MB）。
- `build.minify: 'terser'` を明示しているため、Vite 8 の minifier デフォルトが Oxc Minifier に変わっても本プロジェクトの本番 minify は影響を受けない（`terser` devDep は継続）。
- `optimizeDeps.esbuildOptions` / `splitVendorChunkPlugin` / 独自 Vite plugin / UMD・IIFE ライブラリビルド・SSR は使用していない（壊れやすいポイントの多くは該当しない）。
- Storybook は `@storybook/react-vite` 経由で Vite に乗っているため、**Vite 8 化と Storybook 10 化は連動して進める必要がある**（Storybook 10.3 で Vite 8 サポート）。
- 直近の本番ブランチ (`renewal`) では `index.html` / `src/App.tsx` / `src/App.test.tsx` などに既存変更が乗っており、本 spec の作業はこのブランチ系列ではなく独立ブランチで進める前提。
- 並行進行中の [[spec-spa-perf]] は本 spec のスコープ外。tasks.md の PR 順序とは独立に進める。

## Glossary

- **Tooling_Stack**: ビルド / 開発 / テスト / 型 / Lint / Storybook を構成する devDependency 群（Vite, @vitejs/plugin-react, Vitest, Storybook, TypeScript, typescript-eslint）の総称
- **Vite8_Build_Pipeline**: Vite 8 における新しい内部構成（dependency optimizer = Rolldown、JS transform/minify = Oxc、CSS minify = Lightning CSS）
- **Rolldown_Bundler**: Vite 8 から導入される Rust 製の Rollup 互換バンドラ。production build と dependency optimization の両方に使われる
- **Oxc_Transformer**: Vite 8 で esbuild の代わりに JS transform / minify を担う Rust 製ツール
- **Lightning_CSS_Minifier**: Vite 8 でデフォルト CSS minifier となる Rust 製 CSS ツール。本プロジェクトでは既に `cssMinify: 'lightningcss'` を明示済み
- **Modern_Browser_Baseline_V7**: Vite 7 で導入された `build.target` のデフォルト `'baseline-widely-available'`（Chrome 107 / Edge 107 / Firefox 104 / Safari 16.0 以上相当）
- **Modern_Browser_Baseline_V8**: Vite 8 で更新された `'baseline-widely-available'` の対象。Web Platform Baseline の更新に追従するため、Safari は **16.4 以上相当** に引き上がる（その他ブラウザは同等以上）。Safari 16.0〜16.3 を含める必要がある場合は `build.target` の明示が必要
- **Manual_Chunks_Function**: 現 `vite.config.ts` の `build.rollupOptions.output.manualChunks(id) => string | undefined`。`vendor-supabase` / `vendor-react` / `vendor-{name}` を割り当てる関数形式
- **Realtime_V2_Serializer**: `@supabase/supabase-js` 2.81.0 で導入され、2.91.0 でデフォルト化された Realtime チャネルの V2 ペイロード serializer
- **Realtime_Smoke_Test**: 本 spec の検収項目として実施する Realtime 動作確認手順（チャネル購読 → INSERT 検知 → トークン更新後の再接続 → タブ復帰後の購読維持）
- **TS_Eslint_Stack**: `@typescript-eslint/eslint-plugin` / `@typescript-eslint/parser` / `typescript-eslint` メタパッケージの 3 点セット。すべて同じメジャー・マイナーで揃える必要がある
- **CJS_Default_Import_Compat**: Vite 8 の `legacy.inconsistentCjsInterop: true`。CommonJS の default import 互換性のための移行用フラグ
- **Node_Runtime_Floor**: 本プロジェクトの最低 Node ランタイム要件。Vite 8 / Supabase JS 2.105 の両方を満たす `>=20.19 <21 || >=22.12` を採用
- **Upgrade_PR_Sequence**: 本 spec の 6 PR 構成（typescript-eslint 整合 → Supabase JS → React 19.2 → TypeScript 6 → Vite 7 中継 → Vite 8 + Storybook 10）

## Requirements

### Requirement 1: TS_Eslint_Stack のバージョン整合

**User Story:** 開発者として、ESLint の動作をバージョン不整合に起因する不可解な失敗から守りたい。Lint ルール挙動を予測可能に保つため。

#### Acceptance Criteria

1. THE `package.json` SHALL `@typescript-eslint/eslint-plugin` / `@typescript-eslint/parser` / `typescript-eslint` の 3 パッケージを同一の `^8.x` メジャー・マイナーで宣言する（現行 `8.44.x` 系を基準に、最新 `8.x` まで合わせて良い）。
2. WHEN `pnpm install` が完了する, THE lockfile SHALL 上記 3 パッケージの解決バージョンを同一の semver メジャー・マイナーに揃える。
3. WHEN `pnpm lint` を実行する, THE lint コマンド SHALL 既存ルールセットで 0 エラー・0 不整合警告で終了する（既存の許容警告は維持）。
4. THE `eslint.config.*` / `.eslintrc.*` SHALL 本 PR ではルール内容（`rules` / `plugins` / `languageOptions`）を変更しない。**例外**: `ignores` への `storybook-static` 追加は許容する（ローカルに残存する Storybook ビルド成果物を `eslint .` がスキャンしてハングする既知問題への最小対処で、ルール挙動には影響しない）。`eslint .` の対象ファイル集合が変わるため、PR 前後の lint 結果比較は `storybook-static/` を除外した上で行う。

### Requirement 1.5: ESLint v10 への更新と react-hooks v7 ルール対応（PR1 同梱）

**User Story:** 開発者として、ESLint 本体と plugin 群を 2026 年 5 月時点の最新安定版に揃え、新しい anti-pattern 検出ルール（特に `react-hooks/set-state-in-effect`、`react-hooks/refs`）から将来のバグを未然に防ぎたい。

#### Acceptance Criteria

1. THE `package.json` SHALL 以下を最新の安定版に揃える:
   - `eslint`: `^10.x`
   - `@eslint/js`: `^10.x`
   - `eslint-plugin-react-hooks`: `^7.x`
   - `eslint-plugin-react-refresh`: `^0.5.x`
2. WHEN `pnpm lint` を実行する, THE lint コマンド SHALL `react-hooks/set-state-in-effect` / `react-hooks/refs` 違反を 0 件にする。新規違反は **eslint-disable で抑制せず**、React 公式推奨パターンで解消する:
   - 同期的に loading state を立てる場合 → `useState` の初期値で `true` を渡す
   - props を state にコピー → トップレベルで直接 props を使う
   - 他の値から算出可能 → render 中に計算（必要なら `useMemo`）
   - props 変化で全 state リセット → `key` で remount
   - props 変化で一部 state リセット → render 中に「前回値からの変化検知」パターン（`if (prev !== curr) { setPrev(curr); setX(...); }`）
   - ユーザーイベント起点の logic → `useEffect` ではなく event handler / `useCallback` 側へ
3. WHEN `react-hooks/refs` 違反が出る場合, THE 対応 SHALL:
   - render 中に ref を読み出している箇所は `useMemo` 等の派生値計算に置き換える
   - lazy 初期化が必要な場合のみ `if (ref.current == null) { ref.current = ... }` の厳密パターンを使う（`!ref.current` ではなく `== null`）
4. THE 本 PR SHALL `useEffectEvent` / `<Activity />` 等の React 19.2 新 API を採用しない（Requirement 4.5 と同等の制約）。**例外**: `React.use()` の採用は Requirement 1.7 で個別に許容する (PR1 の `usePreloadChatLogs` 関連)。
5. WHEN 14 件以上の新規違反を一括修正する, THE 対応 SHALL `pnpm test` 全件緑を維持し、特にチャット入室 / リアルタイム購読 / RetroSplitter の挙動が回帰していないことを確認する。

### Requirement 1.6: useResetOnChange による DRY 化（PR1 同梱）

**User Story:** 開発者として、Requirement 1.5 で 5 箇所に展開した「前回値からの変化検知」パターンを共通フックに抽出し、保守性を高めたい。

#### Acceptance Criteria

1. THE `src/shared/hooks/useResetOnChange.ts` SHALL 以下シグネチャの共通フックを新規追加する:
   ```ts
   export function useResetOnChange<T>(value: T, onChange: (next: T, prev: T) => void): void;
   ```
   内部実装は `useState` で前回値を保持し、`Object.is(value, prev)` が false の場合のみ `setPrev(value)` と `onChange(value, prev)` を render 中に実行する。
2. THE 以下 5 箇所 SHALL `useResetOnChange` 経由に置き換える:
   - `src/pages/ChatLogPage.tsx` (windowRows 変更)
   - `src/features/chat/hooks/useChatLog.ts` (roomId 変更)
   - `src/features/chat/components/RetroSplitter/index.tsx` (topTypeName 変更)
   - `src/features/chat/components/EntryForm/EntryForm.stories.tsx` (initial props 変更)
   - `src/features/chat/components/ChatRoom/ChatRoom.stories.tsx` (initial props 変更)
3. WHEN `pnpm test` を実行する, THE 全テスト SHALL 緑を維持する。特に既存の RetroSplitter test (`sets initial topHeight based on top element type`) と App.test (redirect 経路含む) が回帰しないこと。
4. THE 本 refactor SHALL `useResetOnChange` 自体の単体テスト (`src/shared/hooks/useResetOnChange.test.ts`) を追加し、(a) 値変化時のみ `onChange` が呼ばれる、(b) `Object.is` で同値判定する、の 2 ケースを最低限カバーする。

### Requirement 1.7: usePreloadChatLogs を Suspense リソース化（PR1 同梱）

**User Story:** 開発者として、Requirement 1.5 で暫定的に `useMemo` ベースにした `usePreloadChatLogs` を、render を跨いで安定した promise を返す Suspense リソースに書き換え、render 中 I/O 発火と不要な再 fetch リスクを根本解消したい。Copilot PR #54 review 指摘 #3 への対応。

**設計注記**: `React.cache()` は React Server Components 専用で、Client Components では呼び出しごとに関数が再実行される (= `useMemo` と同じ問題が残る)。本要件では **module-level `Map` を用いた手動 promise キャッシュ**を採用し、`React.use()` で Suspense 境界から読み出す。

#### Acceptance Criteria

1. THE `src/features/chat/hooks/usePreloadChatLogs.ts` SHALL module-level `Map<RoomId, Promise<Chat[]>>` で `loadInitialChatLogs(roomId, 100)` の promise をメモ化する。`useMemo` 経由の render 中 I/O 発火 (Copilot 指摘 #3) を解消し、同 `roomId` の連続呼び出しでは同じ promise インスタンスを返す。
2. THE 同ファイル SHALL `fetchInitialChatLogPage(roomId, limit, reloadToken)` も module-level `Map<string, Promise<{ data, hasMore }>>` で同様にメモ化して export する。`reloadToken` を cache key に含めることで「再読込」ボタンで新規 promise を作る。`reloadToken` 変更時は **同 `roomId|limit` プレフィックスの旧 entry を削除**してメモリリークを防ぐ。
3. THE consumer (`src/pages/ChatLogPage.tsx`) SHALL Suspense 境界内のサブコンポーネントで `React.use(fetchInitialChatLogPage(...))` を呼び、`isLoading` state による分岐と手動 `useEffect` での `setIsLoading(true/false)` を完全除去する。
4. WHEN windowRows 変更 / 再読込ボタンによる再 fetch が必要な場合, THE 対応 SHALL リソース key (`${windowRows}-${reloadKey}`) を内包したサブコンポーネントに `key={...}` を渡して remount で再 fetch を起こす設計とする。
5. WHEN `pnpm test` を実行する, THE 既存 `ChatLogPage.test.tsx` SHALL 緑を維持する。Suspense fallback が描画される瞬間のテスト assert は `await waitFor(...)` で逃がしてよい。
6. THE 本 PR SHALL `useEffectEvent` / `<Activity />` 等の他の React 19 新 API は引き続き採用しない (Requirement 4.5)。本要件は `React.use()` のみを Requirement 1.5 の anti-pattern 解消と PR #54 review #3 対応のために許容する例外。
7. WHEN `usePreloadChatLogs` の戻り値型が変わる場合, THE consumer SHALL `as any` を使わず正しい型シグネチャに従って解消する。

### Requirement 2: Node_Runtime_Floor の明示

**User Story:** チームメンバーおよび CI として、Vite 8 / Supabase JS 2.105 が必要とする Node バージョンを満たしているか機械的に判定したい。ローカル/CI 環境差による事故を防ぐため。

#### Acceptance Criteria

1. THE `package.json` SHALL `engines.node` を `">=20.19.0 <21 || >=22.13.0"` で宣言する。下限の `22.13.0` は ESLint 10.4.0 の `engines.node` (`^20.19.0 || ^22.13.0 || >=24`) 要件に合わせる (Copilot PR #54 review 指摘 #1)。
2. WHEN プロジェクト直下で `node --version` を実行する, THE 開発者 SHALL Node 22.13.0 以上 または 20.19.0 以上を使用していることを確認できる。
3. WHERE リポジトリに `.nvmrc` または `.node-version` が存在する場合, THE そのファイル SHALL `engines.node` を満たす Node メジャーバージョン（22 LTS 系を推奨）を指定する。両ファイルとも存在しない場合は本 spec で新規作成しない。
4. WHEN CI 実行環境の Node バージョンが `engines.node` を満たさない, THE CI SHOULD `pnpm install` 段階で警告を出力する。**pnpm のデフォルトでは `engine-strict` が無効のため `pnpm install` は警告のみで成功する**。本 spec では `.npmrc` への `engine-strict=true` 追加は行わない。確実な失敗を保証するため、CI ワークフローに明示の Node バージョンチェック（例: `node -e "process.exit(process.versions.node.split('.').map(Number)[0] >= 22 ? 0 : 1)"`）を入れることを推奨するが、CI ワークフロー定義の変更は本 spec の範囲外とする。

### Requirement 2.5: pnpm ツールチェーン更新（PR1 同梱）

**User Story:** 開発者として、Vite 8 / Storybook 10 が依存しうる新しい pnpm 機能（`allowBuilds` 等）に追従できる状態を整えたい。PR1 着手時点で pnpm v10 系から v11 系へ更新する。

#### Acceptance Criteria

1. THE 開発環境の pnpm SHALL `v11.x` 以上であること（PR1 着手時点で `pnpm add -g pnpm@latest` 等で更新）。
2. WHEN pnpm v11 で初回 `pnpm install` を行う, THE 開発者 SHALL `node_modules` を再作成する必要がある（pnpm v10 の store v10 → v11 の store v11 への移行のため）。CI 環境では `CI=true` がデフォルトで設定されるため modules purge の確認プロンプトは自動承認される。ローカルでは `CI=true pnpm install` を 1 回実行する。
3. WHEN pnpm v11 が `pnpm-workspace.yaml` に `allowBuilds` のプレースホルダ（値が `"set this to true or false"` 等の文字列）を自動追記した場合, THE `pnpm-workspace.yaml` SHALL `allowBuilds` のキーごとにブール値（`true` または `false`）を明示する。`onlyBuiltDependencies` と同じパッケージ一覧については `true` を設定する。
4. WHEN pnpm v11 で `pnpm install` / `pnpm <script>` を実行する, THE 各コマンド SHALL `[ERR_PNPM_IGNORED_BUILDS]` を出さずに成功する（Requirement 2.5.3 で `allowBuilds` を埋めることで解消する）。
5. THE `pnpm-lock.yaml` SHALL pnpm v11 形式（`lockfileVersion: '9.0'`）で再生成される。lockfile の大規模 diff は本 PR で許容する（pnpm v11 移行に伴う一回限りの変更）。

### Requirement 3: Supabase JS 2.105 系への更新

**User Story:** チャットユーザーとして、Realtime のメッセージ受信・再接続・ログイン後の購読挙動が壊れずに動き続けてほしい。Realtime / Auth / Storage の安定化パッチを取り込みつつ、既存のチャット動作を維持するため。

#### Acceptance Criteria

1. THE `package.json` SHALL `@supabase/supabase-js` を `^2.105.x`（更新時点の最新 2.105 系）で宣言する。
2. WHEN `pnpm install` が完了する, THE lockfile SHALL Realtime_V2_Serializer をデフォルトで使用するバージョン（2.91.0 以降）を解決する。
3. WHEN チャットページで `supabase.channel(...).on('postgres_changes', ...).subscribe()` を実行する, THE Realtime_Smoke_Test SHALL 以下 4 点が成立することを確認する。
   - 1. 別タブからの INSERT を 1 度受信できる。
   - 2. Supabase Auth のトークン更新（手動の `supabase.auth.refreshSession()` または期限到来）後も購読が維持される。
   - 3. タブを非アクティブ → アクティブに復帰した後、購読が継続している。
   - 4. `unsubscribe()` 後に同 roomId で再 `subscribe()` した際、二重受信が発生しない。
4. WHEN チャットの DB 操作（`supabase.from('chat_log').select() / insert() / update() / delete()`）を実行する, THE 既存の `src/features/chat/api/chatApi.ts` テスト群 SHALL ランタイムエラーなく緑になる。型エラーが新たに発生した場合は、本 PR 内でクエリビルダの型シグネチャに沿って解消する。
5. WHERE `@supabase/supabase-js` の更新で TypeScript 型推論の精度向上により赤線が増える場合, THE 修正 SHALL `as any` で塗りつぶさず、`from()` / `select()` / `not(..., 'is', null)` 等の正しい型シグネチャに沿って解消する。
6. WHEN Auth / Storage / Functions を使用していない箇所がある場合, THE 本 PR SHALL それらの動作確認を必須としない（本プロジェクトの利用範囲に応じてスコープを限定）。ただし `supabase.auth.*` を 1 箇所でも呼んでいる場合は、ログイン/ログアウトの一連動作を手動で 1 回確認する。
7. THE 本 PR SHALL `legacy.inconsistentCjsInterop` 等の Vite 側互換フラグを使用しない（このフラグは Vite 8 PR で必要に応じて検討する）。

### Requirement 4: React 19.2 への更新

**User Story:** 開発者として、React の最新安定版 (19.2) に追従し、`useEffectEvent` / `<Activity />` / DevTools のパフォーマンストラックなど将来の採用判断を可能にしたい。

#### Acceptance Criteria

1. THE `package.json` SHALL `react` / `react-dom` を `^19.2.x`（更新時点の最新 19.2 系）で宣言する。
2. THE `package.json` SHALL `@types/react` / `@types/react-dom` を React 19.2 対応版に更新する。
3. WHEN `pnpm typecheck` を実行する, THE TypeScript コンパイラ SHALL React 19.2 の型定義変更に起因する新規エラーを 0 件にする（必要なら呼び出し側を 19.2 の型に合わせて修正）。
4. WHEN `pnpm test` を実行する, THE Vitest + @testing-library/react SHALL 既存テストを緑のまま維持する。
5. THE 本 PR (PR3) SHALL `useEffectEvent` / `<Activity />` 等の新 API の **採用** を行わない（API 採用は別 spec の責務とし、本 PR はランタイム更新のみ）。**例外**: Requirement 1.7 で許容した PR1 同梱の `React.use()` 採用は対象外。
6. WHEN React 19.2 の StrictMode による二重マウントの挙動変化が観測される場合, THE 対処 SHALL [[spec-spa-perf]] の `realtimeChannelRegistry` 設計に委ね、本 PR では既知の挙動として記録する。

### Requirement 5: TypeScript 6.0 への更新

**User Story:** 開発者として、TypeScript 6.0 に追従し、Go ネイティブ実装へ向かう移行期の機能・診断改善を享受したい。

#### Acceptance Criteria

1. THE `package.json` SHALL `typescript` を `~6.0.x`（更新時点の最新 6.0 系）で宣言する。
2. WHEN `pnpm typecheck` を実行する, THE TypeScript コンパイラ SHALL 既存コードベースを 0 エラーで通す。新規に検出されたエラーは型シグネチャの修正で解消し、`@ts-ignore` / `@ts-expect-error` を新規追加しない（既存の `expect-error` は理由コメント付きで維持可）。
3. WHEN `pnpm build`（`tsc -b && vite build`）を実行する, THE ビルドコマンド SHALL 緑で完了する。
4. THE `tsconfig*.json` SHALL `target` / `module` / `moduleResolution` の既存設定を維持する（TS 6.0 で deprecate された設定があれば差し替える）。
5. WHEN TS 6.0 の Lint / TS-ESLint との非互換が発生する場合, THE 解消 SHALL Requirement 1 で整合した TS_Eslint_Stack を最新 `^8.x` まで上げて対応する。それでも解消しない場合は本 PR を一時取り下げて切り戻し、原因調査タスクを別途立てる。

### Requirement 6: Vite 7 への中継更新

**User Story:** 開発者として、Vite 6 → 8 の大ジャンプを 1 PR で行うリスクを避け、Vite 7 を中継してエラー切り分けを容易にしたい。

#### Acceptance Criteria

1. THE `package.json` SHALL `vite` を `^7.x`（更新時点の最新 7 系）で宣言する。
2. THE `package.json` SHALL `@vitejs/plugin-react` を Vite 7 対応版（公式 README の peer dependency 範囲）に更新する。
3. THE `package.json` SHALL `vitest` / `@vitest/coverage-v8` / `@vitest/ui` を Vite 7 対応版（Vitest 3.2 以降）に揃える。
4. THE `vite.config.ts` SHALL Vite 7 の deprecated API（`splitVendorChunkPlugin`、Sass legacy API、旧 `transformIndexHtml` hook 形式など）を使用していないことを確認する。本プロジェクトは現時点でいずれも未使用のため、設定変更は不要。
5. WHEN `pnpm build` / `pnpm preview` / `pnpm test` / `pnpm storybook` を実行する, THE 各コマンド SHALL 緑で完了する。Storybook はこの PR では `9.1.8` のまま Vite 7 と同居させ、Vite 7 環境で `@storybook/react-vite@9.1.8` が起動できることを確認する（起動不可と判明した場合は本 PR を Vite 7 + Storybook 10 のセットへ振り替える）。
6. WHEN `build.target` の Vite 7 デフォルトが `Modern_Browser_Baseline_V7` に変わる影響を確認する, THE 確認結果 SHALL「本プロジェクトは Safari 14 / 15 等の旧 Safari をサポート対象外として扱う」を再確認する。サポートが必要だと判明した場合のみ `build.target: ['safari15', 'chrome107', 'firefox104']` を明示する。
7. THE 本 PR SHALL `build.rollupOptions.output.manualChunks` の関数形式を Vite 7 では維持する（function 形式は Vite 7 では引き続き有効）。Vite 8 PR で対応する。

### Requirement 7: Vite 8 + Storybook 10 への同時更新

**User Story:** 開発者として、Vite 8 の Vite8_Build_Pipeline によるビルド高速化と挙動一貫性を取り込みたい。Storybook が Vite 8 を要求するため両者を同時に更新する。

#### Acceptance Criteria

1. THE `package.json` SHALL `vite` を `^8.x`（更新時点の最新 8 系）で宣言する。
2. THE `package.json` SHALL `@vitejs/plugin-react` を Vite 8 対応版に更新する。
3. THE `package.json` SHALL `storybook` / `@storybook/react-vite` / `@storybook/react` を `^10.3.x` 以上（Vite 8 対応版）に更新する。`@chromatic-com/storybook` も Storybook 10 対応版に揃える。
4. THE `package.json` SHALL `vitest` / `@vitest/coverage-v8` / `@vitest/ui` を Vite 8 対応版に更新する。
5. THE `package.json` SHALL `lightningcss` を **devDependencies に明示追加** する（Vite 8 で optional peer から通常依存に昇格するため、本プロジェクトでも明示宣言して将来の整合性を保つ）。バージョンは Vite 8 の peer dependency 範囲に合わせる。
6. WHEN `vite.config.ts` の `build.rollupOptions.output.manualChunks` 関数形式が Vite 8 で deprecation 警告を出す, THE 対応 SHALL 次のいずれかで解消する。
   - 1. 関数形式のまま継続し、警告は許容する（Vite 8 でも互換層で動作する場合）。
   - 2. Vite 標準の自動 vendor 分割に委ね、`manualChunks` を削除する。
   - 3. `build.rolldownOptions.output.advancedChunks` または同等 API へ移行する。
        選択した方針は design.md の「Manual Chunks 戦略」セクションに記録し、選択理由（生成チャンク数、`vendor-supabase` の保持有無、TopPage の初期チャンクへの影響）を 1 段落で残す。
7. THE 本 PR SHALL `build.minify: 'terser'` の指定を維持する（Vite 8 の Oxc Minifier デフォルト化の影響を受けないことを確認する）。
8. THE 本 PR SHALL `optimizeDeps.include` の指定を維持する。`optimizeDeps.esbuildOptions` は本プロジェクトで未使用のため、`optimizeDeps.rolldownOptions` への移行作業は発生しない。
9. WHEN CommonJS の default import に依存している箇所で本番ビルドが壊れる, THE 対応 SHALL まず該当 import を named import に書き換えて解消を試み、それでも解消しない場合のみ `legacy.inconsistentCjsInterop: true` を**期限付きの TODO コメント付きで**一時設定する。`tasks.md` に解除タスクを残す。
10. WHEN 本プロジェクトに UMD / IIFE / `output.format: 'system' | 'amd'` ライブラリビルドが存在しないことを確認する, THE 確認結果 SHALL「該当なし」を design.md に記録する（現状は SPA のみ）。
11. WHEN `pnpm build` / `pnpm preview` / `pnpm test` / `pnpm storybook` / `pnpm build-storybook` / `pnpm chromatic:dryrun` を実行する, THE 各コマンド SHALL 緑で完了する。
12. WHEN `pnpm build` 後に `dist` のサイズを `du -sh dist` で測定する, THE 出力サイズ SHALL 本 PR 直前比で `gzip 後の総 JS サイズ +5% 以内` を維持する。超過した場合は manualChunks 戦略を見直す（Requirement 7.6）。
13. WHEN Vite 8 で `build.target` のデフォルトが `Modern_Browser_Baseline_V8` に更新される影響を確認する, THE 確認結果 SHALL「本プロジェクトは Safari 16.4 未満（16.0〜16.3）をサポート対象外として扱う」を明示的に判断・記録する。Safari 16.0〜16.3 をサポート対象に含める必要がある場合のみ `build.target: ['safari16', 'chrome107', 'firefox104']` を明示する。判断は design.md の「Manual Chunks 戦略」セクション直前または直後に 1 段落で記録する。

### Requirement 8: CI / pre-commit / Storybook の回帰検証

**User Story:** メンテナとして、各 PR を取り込む直前に主要コマンドが緑であることを機械的に保証したい。

#### Acceptance Criteria

1. WHEN 各 PR の最終コミット時点で以下のコマンドを実行する, THE 全コマンド SHALL 緑で完了する。
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test`（カバレッジしきい値 50% 以上を維持）
   - `pnpm build`
   - `pnpm preview`（手動で http://localhost のトップページとチャットページが描画されることを目視確認）
   - `pnpm storybook` 起動確認（Vite 8 PR では `pnpm build-storybook` まで実施）
2. WHEN `lefthook` の pre-commit / pre-push フックが存在する, THE 各 PR SHALL フック設定を変更せずに緑で通過する。
3. WHEN `pnpm chromatic:dryrun` を Vite 8 + Storybook 10 PR で実行する, THE 出力 SHALL Storybook 10 のスナップショット生成が成功する（既存ストーリーの visual diff 内容は本 spec のレビュー対象外）。
4. WHEN 本 spec の全 PR が main に取り込まれた後, THE プロジェクト SHALL Node `v22 LTS` で `pnpm install && pnpm build:prod` がクリーン環境で完走する。

## Non-Goals

- **runtime 機能の追加・削除**: 本 spec はツールチェーン更新のみを扱う。`useEffectEvent` / `<Activity />` / Supabase Realtime V2 metadata API 等の新機能の採用は別 spec とする。**例外**: Requirement 1.7 で許容した PR1 同梱の `React.use()` 採用は対象外 (Copilot PR #54 review #3 への根本対処)。
- **[[spec-spa-perf]] の未完了 PR (PR2-7) の前倒し**: SPA パフォーマンス最適化の継続作業と本 spec の作業は独立に進める。`vite.config.ts` の manualChunks 変更が両 spec に影響する場合は、本 spec のマージを先行させてから [[spec-spa-perf]] のリベース対応を行う。
- **Vite 8 の `rolldownOptions` への全面移行**: 本 spec では `build.rollupOptions` の互換層を当面利用する。`rolldownOptions` への移行は Vite 8 の互換層が削除されるタイミングまでに別 spec で行う。
- **legacy ブラウザ（Safari 14 / 15、IE11、Chrome <107 等）のサポート追加**: 本プロジェクトは Modern_Browser_Baseline で十分とし、`@vitejs/plugin-legacy` 等の導入は行わない。
- **SSR / Cloudflare Workers / Edge Functions 内での `npm:@supabase/supabase-js` 利用**: 本プロジェクトは SPA のみのため、これらの環境に関する追加検証は行わない。
- **Lint ルールの追加変更**: typescript-eslint のバージョン整合のみを行い、`eslint.config.*` のルール内容は変更しない。
- **`pnpm engine-strict=true` の導入**: Node バージョンの宣言までは行うが、pnpm の strict モード切替は別途検討する。

## Success Metrics

### 必須

- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` / `pnpm preview` / `pnpm storybook` / `pnpm build-storybook` が **全 PR の最終コミット時点で緑**。
- [ ] チャット room への入室、メッセージ送信、別タブ受信、退室、参加者一覧更新が手動で動作確認できる。
- [ ] `chatApi.ts` の Supabase クエリが TypeScript エラーなし、Vitest 緑。
- [ ] `vite.config.ts` の `manualChunks` 戦略が design.md に文書化されている（関数継続 / 削除 / `advancedChunks` 移行のいずれか）。
- [ ] `engines.node` が `package.json` に宣言され、Node 22 LTS でクリーンインストールが通る。
- [ ] `@typescript-eslint/eslint-plugin` / `@typescript-eslint/parser` / `typescript-eslint` の 3 パッケージが同一メジャー・マイナーで揃う。

### 推奨

- [ ] `pnpm build` の wall-clock 時間が Vite 6 比で短縮されることを 1 回計測し、design.md に記録する（Vite 8 の Rolldown 移行効果の確認、目標値は設けない）。
- [ ] `dist` の gzip 後総 JS サイズが本 spec 開始時点 ±5% 以内（Requirement 7.12）。
- [ ] `pnpm chromatic:dryrun` が Storybook 10 環境で完走する。
- [ ] Supabase Realtime の購読が「ログイン → トークン更新 → タブ復帰」のシナリオで安定動作する（Realtime_Smoke_Test）。

### 観測のみ（合否判定しない）

- node_modules の install サイズが Vite 8 で約 15MB 増加することを観測し、CI キャッシュへの影響を 1 回計測する。
- React 19.2 の StrictMode 二重マウント挙動の変化を 1 回観測する。
