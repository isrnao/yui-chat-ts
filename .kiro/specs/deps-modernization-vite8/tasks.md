# 実装計画: deps-modernization-vite8

## 概要

Tooling_Stack の更新を 6 PR に分割し、低リスク → 高リスクの順で段階実装する。各 PR は独立に revert 可能で、`git bisect` で障害原因を 1 PR まで特定できるよう、1 PR = 1 メジャー更新を原則とする。

## 推奨実装順序（PR 単位）

1. **PR1**: Task 1 (R1) — TS_Eslint_Stack 整合
2. **PR2**: Task 2 (R3) — Supabase JS 2.105 系へ更新
3. **PR3**: Task 3 (R4) — React 19.2 へ更新
4. **PR4**: Task 4 (R5) — TypeScript 6.0 へ更新
5. **PR5**: Task 5 (R6) — Vite 7 中継 + @vitejs/plugin-react + Vitest
6. **PR6**: Task 6 + Task 7 (R7) — Vite 8 + Storybook 10 + lightningcss devDep 明示 + manualChunks 戦略決定

Task 0 (R2: Node_Runtime_Floor) は PR1 で同梱する（変更が小さく、後続 PR の前提条件にもなるため）。
Task 0.5 (R2.5: pnpm v11 移行) も PR1 で同梱する（Vite 8 / Storybook 10 への進路で必要となるツールチェーン更新で、ts-eslint 更新時の lockfile 形式と整合させるため一緒に行う）。
Task 1.5 (R1.5: eslint v10 + react-hooks v7) も PR1 で同梱する（lint stack を 1 PR で 2026 年 5 月時点の最新安定版に揃え、後続 PR で新規 lint エラーに振り回されないようにするため）。
Task 1.6 (R1.6: useResetOnChange DRY 化) と Task 1.7 (R1.7: usePreloadChatLogs cache()+use() 化) も PR1 で同梱する（Task 1.5 で導入した「前回値検知」パターンの共通化と、暫定 `useMemo` 実装の根本対処を同一 PR 内で完結させるため）。
Task 8 (R8: CI / pre-commit / Storybook 回帰検証) は各 PR の最終コミット時に共通で実施する横断タスク。

## Tasks

- [ ] 0. Node_Runtime_Floor の明示（Requirement 2、PR1 に同梱）
  - [ ] 0.1 `package.json` に `engines.node` を追加する
    - `"engines": { "node": ">=20.19.0 <21 || >=22.12.0" }` を `scripts` の直前または `devDependencies` の直後に配置
    - _Requirements: 2.1_
  - [ ] 0.2 ローカル Node バージョンが engines を満たすことを確認する
    - `node --version` で `v22.12.0` 以上または `v20.19.0` 以上であることを確認
    - 不足している場合は本 spec 着手前に Node 22 LTS へ揃える
    - _Requirements: 2.2_
  - [ ] 0.3 `.nvmrc` / `.node-version` の存在を確認する
    - 既存ファイルがある場合のみ Node 22 LTS（例: `22.20.0`）へ更新
    - 存在しない場合は本 spec で新規作成しない
    - _Requirements: 2.3_

- [ ] 0.5 pnpm v11 への移行（Requirement 2.5、PR1 に同梱）
  - [ ] 0.5.1 `pnpm add -g pnpm@latest` を実行し、pnpm を v11.x 以上に更新する
    - `pnpm --version` で `11.x` 以上であることを確認
    - _Requirements: 2.5.1_
  - [ ] 0.5.2 `CI=true pnpm install` を実行し、`node_modules` を pnpm v11 store へ張り直す
    - pnpm v11 は modules purge の確認プロンプトを出すため `CI=true` で自動承認
    - _Requirements: 2.5.2_
  - [ ] 0.5.3 `pnpm-workspace.yaml` の `allowBuilds` プレースホルダをブール値で埋める
    - pnpm v11 が自動追記する `"set this to true or false"` 等の文字列を `true` / `false` に置き換える
    - `onlyBuiltDependencies` に列挙されているパッケージは `true` を設定
    - _Requirements: 2.5.3, 2.5.4_
  - [ ] 0.5.4 `pnpm-lock.yaml` が `lockfileVersion: '9.0'` で再生成されることを確認する
    - lockfile 全行の大規模 diff は本 PR で許容（一回限りの移行）
    - _Requirements: 2.5.5_

- [ ] 1. TS_Eslint_Stack のバージョン整合（Requirement 1、PR1）
  - [ ] 1.1 `pnpm up typescript-eslint@^8.44 @typescript-eslint/eslint-plugin@^8.44 @typescript-eslint/parser@^8.44` を実行する
    - 3 パッケージの解決バージョンを同一の `^8.x` メジャー・マイナーに揃える
    - _Requirements: 1.1, 1.2_
  - [ ] 1.2 `pnpm lint` を実行し、PR 前と warning / error 件数が一致することを diff で確認する
    - 既存の許容警告は維持。新規エラー / 新規 warning が出た場合は本 PR で取り扱わず、原因が ts-eslint バージョン揃え以外であることを確認したうえで切り戻す
    - PR 前のベースライン取得時に `pnpm lint` がハングする場合は Task 1.3a の対処を先に行う
    - _Requirements: 1.3_
  - [ ] 1.3 `eslint.config.*` / `.eslintrc.*` のルール内容（`rules` / `plugins` / `languageOptions`）を変更していないことを `git diff` で確認する
    - _Requirements: 1.4_
  - [ ] 1.3a `eslint.config.js` の `ignores` に `storybook-static` を追加する（例外対応）
    - ローカルに残存する Storybook ビルド成果物（minified JS 多数）を `eslint .` がスキャンして CPU 100% でハングする既知問題への最小対処
    - ESLint v9 の flat config は `.gitignore` を自動参照しないため、`storybook-static/` を明示的に ignore する必要がある
    - ルール挙動には影響しない設定変更のため Requirement 1.4 の例外として許容
    - _Requirements: 1.4_
  - [ ]\* 1.4 PR8 共通検収を実行する（typecheck / lint / test / build / preview）
    - _Requirements: 8.1, 8.2_

- [ ] 1.5 ESLint v10 + react-hooks v7 への更新（Requirement 1.5、PR1 同梱）
  - [ ] 1.5.1 `pnpm up eslint@^10 @eslint/js@^10 eslint-plugin-react-hooks@^7 eslint-plugin-react-refresh@^0.5` を実行する
    - _Requirements: 1.5.1_
  - [ ] 1.5.2 `pnpm lint` を実行し、react-hooks v7 で新たに有効化された `react-hooks/set-state-in-effect` / `react-hooks/refs` 違反を全件解消する
    - eslint-disable / eslint-disable-next-line による抑制は禁止
    - 公式 anti-pattern 解消パターン（Req 1.5.2）に従って各ファイルを refactor する
    - _Requirements: 1.5.2_
  - [ ] 1.5.3 PR1 着手時点で 14 件あった違反の対応カテゴリを把握する（参考）:
    - `set-state-in-effect` 10 件: data fetch (`useChatLog`, `ChatLogPage`, `EntryForm` の settings sync, RetroSplitter の top 種別変化, App.tsx の redirect 処理, Story 5 件)
    - `refs` 4 件: lazy init (`App.stories`, `ChatLogPage.stories`)、ref-update-in-render (`useReloadInterval`)、ref-return-in-render (`usePreloadChatLogs` → `useMemo` 化)
    - _Requirements: 1.5.2, 1.5.3_
  - [ ] 1.5.4 `pnpm test` 全件緑、特に以下の挙動が回帰していないことを確認する:
    - チャット入室フロー（EntryForm の localStorage 由来初期値が `ChatRoute` 側 useState の lazy init に移動）
    - リアルタイム購読（`useChatLog` の roomId 変更時の reload）
    - RetroSplitter の top コンポーネント切替時の高さ初期化
    - _Requirements: 1.5.5_
  - [ ] 1.5.5 useEffectEvent / `<Activity />` 等の React 19.2 新 API を採用していないことを `git diff src/` で確認する（PR1 同梱の `cache()` + `use()` は Task 1.7 で個別許容）
    - _Requirements: 1.5.4_

- [ ] 1.6 useResetOnChange による DRY 化（Requirement 1.6、PR1 同梱）
  - [ ] 1.6.1 `src/shared/hooks/useResetOnChange.ts` を新規作成する
    - シグネチャ: `function useResetOnChange<T>(value: T, onChange: (next: T, prev: T) => void): void`
    - 内部: `useState` で前回値保持、`Object.is(value, prev)` が false なら render 中に `setPrev(value); onChange(value, prev)` を実行
    - _Requirements: 1.6.1_
  - [ ] 1.6.2 `src/shared/hooks/useResetOnChange.test.ts` を新規作成する
    - (a) 値変化時のみ `onChange` が呼ばれる
    - (b) `Object.is` で同値判定する (NaN 同士を同値とみなす等)
    - _Requirements: 1.6.4_
  - [ ] 1.6.3 PR1 で導入した「前回値検知」5 箇所を `useResetOnChange` 経由に差し替える
    - `src/pages/ChatLogPage.tsx` (windowRows)
    - `src/features/chat/hooks/useChatLog.ts` (roomId)
    - `src/features/chat/components/RetroSplitter/index.tsx` (topTypeName)
    - `src/features/chat/components/EntryForm/EntryForm.stories.tsx`
    - `src/features/chat/components/ChatRoom/ChatRoom.stories.tsx`
    - _Requirements: 1.6.2_
  - [ ] 1.6.4 `pnpm test` 全件緑、既存 RetroSplitter test / App.test (redirect 含む) が回帰しないことを確認
    - _Requirements: 1.6.3_

- [ ] 1.7 usePreloadChatLogs を Suspense リソース化 (`React.use()` 採用)（Requirement 1.7、PR1 同梱）
  - [ ] 1.7.1 `src/features/chat/hooks/usePreloadChatLogs.ts` を module-level `Map` ベースに書き換える
    - 注: `React.cache()` は Server Components 専用で Client では効かないため Map を採用
    - `useMemo` 経由の render 中 I/O 発火 (Copilot PR #54 review #3) を解消
    - 同 roomId の連続呼び出しでは同じ promise インスタンスを返す
    - _Requirements: 1.7.1_
  - [ ] 1.7.2 同ファイルに `fetchInitialChatLogPage(roomId, limit, reloadToken)` を追加
    - 別 `Map` で `{ data, hasMore }` の promise をメモ化
    - reloadToken 変更時は同 `roomId|limit|*` プレフィックスの旧 entry を削除 (メモリリーク防止)
    - _Requirements: 1.7.2_
  - [ ] 1.7.3 `src/pages/ChatLogPage.tsx` の consumer を `React.use(fetchInitialChatLogPage(...))` + `<Suspense>` 境界化する
    - 手動 `isLoading` state を完全除去
    - 再 fetch トリガー (windowRows 変更 / 再読込) は子コンポーネント `key={...}` による remount に置き換え
    - _Requirements: 1.7.3, 1.7.4_
  - [ ] 1.7.4 `pnpm test` の `ChatLogPage.test.tsx` を緑にする
    - Suspense fallback 描画タイミングは `await waitFor(...)` で逃す
    - _Requirements: 1.7.5_
  - [ ] 1.7.5 `as any` を使わず、`use()` の戻り値型に従って consumer を修正する
    - _Requirements: 1.7.7_

- [ ] 2. Supabase JS 2.105 系への更新（Requirement 3、PR2）
  - [ ] 2.1 `pnpm up @supabase/supabase-js@latest` を実行する
    - `package.json` を `^2.105.x`（更新時点の最新 2.105 系）に更新
    - _Requirements: 3.1, 3.2_
  - [ ] 2.2 `src/features/chat/api/chatApi.ts` および呼び出し側で TypeScript 型エラーが出るか `pnpm typecheck` で確認する
    - エラーが出た場合は `from()` / `select()` / `not(..., 'is', null)` 等の正しい型シグネチャに沿って修正
    - `as any` での塗りつぶしを禁止
    - _Requirements: 3.4, 3.5_
  - [ ] 2.3 `pnpm test` の `chatApi.test.ts` 系を緑にする
    - モックが古い API シグネチャに依存している場合のみ最小修正
    - _Requirements: 3.4_
  - [ ]\* 2.4 Realtime_Smoke_Test を手動で実施する
    - 1. 別タブからの INSERT を 1 度受信できる
    - 2. `supabase.auth.refreshSession()` 後も購読が維持される（Auth を使用している場合のみ）
    - 3. タブ非アクティブ → アクティブ復帰後も購読が継続
    - 4. `unsubscribe()` → 再 `subscribe()` で二重受信が発生しない
    - _Requirements: 3.3_
  - [ ]\* 2.5 Auth を使用している場合、ログイン / ログアウトの一連動作を手動で 1 回確認する
    - 使用していない場合はスキップ可
    - _Requirements: 3.6_
  - [ ] 2.6 PR8 共通検収を実行する
    - _Requirements: 8.1, 8.2_

- [ ] 3. React 19.2 への更新（Requirement 4、PR3）
  - [ ] 3.1 `pnpm up react@^19.2 react-dom@^19.2 @types/react@^19.2 @types/react-dom@^19.2` を実行する
    - _Requirements: 4.1, 4.2_
  - [ ] 3.2 `pnpm typecheck` を緑にする
    - 型定義変更に起因する新規エラーは呼び出し側を 19.2 の型に合わせて修正
    - _Requirements: 4.3_
  - [ ] 3.3 `pnpm test` を緑にする
    - @testing-library/react のメジャーが React 19.2 に対応しているか確認、必要なら `@testing-library/react@latest` も更新
    - _Requirements: 4.4_
  - [ ] 3.4 `useEffectEvent` / `<Activity />` などの新 API を本 PR で **採用しない** ことを `git diff src/` で確認する
    - _Requirements: 4.5_
  - [ ]\* 3.5 StrictMode の二重マウント挙動の変化を 1 回観測し、[[spec-spa-perf]] への影響メモを残す
    - 観測のみ。本 PR では対処しない
    - _Requirements: 4.6_
  - [ ] 3.6 PR8 共通検収を実行する
    - _Requirements: 8.1, 8.2_

- [ ] 4. TypeScript 6.0 への更新（Requirement 5、PR4）
  - [ ] 4.1 `pnpm up typescript@^6.0` を実行する
    - _Requirements: 5.1_
  - [ ] 4.2 `pnpm typecheck` を 0 エラーで通す
    - 新規 `@ts-ignore` / `@ts-expect-error` を追加しない
    - 既存の `expect-error` は理由コメント付きで維持
    - _Requirements: 5.2_
  - [ ] 4.3 `pnpm build`（`tsc -b && vite build`）が緑で完了することを確認する
    - _Requirements: 5.3_
  - [ ] 4.4 `tsconfig*.json` の `target` / `module` / `moduleResolution` を維持する
    - TS 6.0 で deprecate された設定があれば差し替え
    - _Requirements: 5.4_
  - [ ] 4.5 TS 6.0 deprecated option の警告を確認する
    - `pnpm exec tsc --showConfig` および `pnpm typecheck` の標準出力に `Option '...' is deprecated` / `Unsupported in TypeScript 6.0` が出ないことを確認
    - 警告が出た場合は当該 option を新シグネチャに差し替える（例: 削除済み option の除去、推奨後継 option への移行）
    - _Requirements: 5.4_
  - [ ] 4.6 `ignoreDeprecations: "6.0"` を原則追加しない
    - 既存の `ignoreDeprecations` 設定がない限り新規追加しない
    - やむを得ず追加する場合は、解除条件（例: 該当ライブラリが TS 6.x 対応版をリリースしたとき）と期限（例: 2026-09-30）を `tsconfig.json` のコメント外に書けないため `tasks.md` の本 task 下にサブタスクとして残す
    - _Requirements: 5.2, 5.4_
  - [ ] 4.7 `types` / `typeRoots` / `baseUrl` / `rootDir` 周りの挙動変化を確認する
    - `pnpm typecheck` で `@types/*` の解決先が PR 前後で変わっていないことを確認（`pnpm exec tsc --traceResolution 2>&1 | head -100` で重要パッケージの解決パスを目視）
    - `baseUrl` / `rootDir` 設定がある場合、Composite project / Project references の挙動が PR 前後で同等であることを `pnpm build` (`tsc -b`) で確認
    - 本プロジェクトの現 tsconfig には `baseUrl` / `rootDir` 設定が存在しない見込みのため、確認のみで設定変更を加えない
    - _Requirements: 5.4_
  - [ ] 4.8 TS-ESLint との非互換が出た場合、Task 1 で整合した TS_Eslint_Stack を最新 `^8.x` まで上げる
    - `WARNING: You are currently running a version of TypeScript which is not officially supported by @typescript-eslint/...` が出た場合も同様に対応
    - 解消しない場合は本 PR を切り戻し、原因調査タスクを別途立てる
    - _Requirements: 5.5_
  - [ ] 4.9 PR8 共通検収を実行する
    - _Requirements: 8.1, 8.2_

- [ ] 5. Vite 7 中継更新（Requirement 6、PR5）
  - [ ] 5.1 `pnpm up vite@^7 @vitejs/plugin-react@latest` を実行する
    - _Requirements: 6.1, 6.2_
  - [ ] 5.2 `pnpm up vitest@latest @vitest/coverage-v8@latest @vitest/ui@latest` を実行する
    - Vitest 3.2 以降が解決されることを確認
    - _Requirements: 6.3_
  - [ ] 5.3 `vite.config.ts` に Vite 7 deprecated API（`splitVendorChunkPlugin`、Sass legacy API、旧 `transformIndexHtml` hook 形式）が存在しないことを確認する
    - 現状は未使用のため変更不要を見込む
    - _Requirements: 6.4_
  - [ ] 5.4 `Modern_Browser_Baseline` の影響を確認する
    - 本プロジェクトは Safari 14 / 15 をサポート対象外として継続。`build.target` の明示は不要
    - サポート要件が変わっている場合のみ `build.target: ['safari15', 'chrome107', 'firefox104']` を明示
    - _Requirements: 6.6_
  - [ ] 5.5 `build.rollupOptions.output.manualChunks` の関数形式を Vite 7 で維持する
    - 変更しない
    - _Requirements: 6.7_
  - [ ] 5.6 `pnpm storybook` が Vite 7 + Storybook 9.1.8 で起動することを確認する
    - 起動できない場合、本 PR を「Vite 7 + Storybook 10」のセットへ振り替え、PR6 のスコープから Storybook 10 を外す
    - _Requirements: 6.5_
  - [ ] 5.7 PR8 共通検収を実行する（PR5 では `pnpm build-storybook` まで実施推奨）
    - _Requirements: 8.1, 8.2_

- [ ] 6. Vite 8 + Storybook 10 への同時更新（Requirement 7、PR6）
  - [ ] 6.1 Storybook の公式 upgrade コマンドを実行する
    - `pnpm dlx storybook@latest upgrade`
    - 対話プロンプトでは Vite 8 対応を選択
    - `storybook` / `@storybook/react-vite` / `@storybook/react` / `@chromatic-com/storybook` が `^10.3.x` 以上に更新されることを確認
    - _Requirements: 7.3_
  - [ ] 6.2 `pnpm up vite@^8 @vitejs/plugin-react@latest` を実行する
    - _Requirements: 7.1, 7.2_
  - [ ] 6.3 `pnpm up vitest@latest @vitest/coverage-v8@latest @vitest/ui@latest` を実行する
    - Vite 8 対応版が解決されることを確認
    - _Requirements: 7.4_
  - [ ] 6.4 `pnpm add -D lightningcss@latest` を実行する
    - Vite 8 で optional peer から通常依存に昇格するため、明示宣言で将来の整合性を確保
    - バージョンは Vite 8 の peer 範囲に合わせる
    - _Requirements: 7.5_
  - [ ] 6.5 Manual Chunks 戦略を決定する
    - **第一候補: 案 B（`manualChunks` 削除、Vite 標準に委ねる）**
    - `vite.config.ts` の `build.rollupOptions.output.manualChunks` 関数を削除し、`pnpm build` を実行
    - 案 B 採択の 3 条件を確認:
      - (1) `find dist/assets -name '*.js' -exec gzip -c {} \; | wc -c` の合計が本 spec 開始時点比 ±5% 以内
      - (2) `grep -lE 'useChatLog|EntryForm|ChatRoom' dist/assets/*.js` の出力が TopPage entry チャンクを含まない
      - (3) `pnpm preview` + DevTools Network で 2 回目訪問時の cache hit ratio が初回比 30% 以上
    - **いずれか 1 つでも満たさない場合のみ案 A にフォールバック**（`manualChunks` 関数を復元、deprecation 警告は許容）
    - 案 C（`rolldownOptions.advancedChunks` 移行）は採用しない
    - 採択した案と理由（生成チャンク数 / 上記 3 条件の計測結果 / TopPage の初期チャンクへの影響）を design.md の「Manual Chunks 戦略」セクションに 1 段落で追記
    - _Requirements: 7.6_
  - [ ] 6.6 `build.minify: 'terser'` の指定を維持する
    - Vite 8 の Oxc Minifier デフォルト化の影響を受けないことを確認
    - _Requirements: 7.7_
  - [ ] 6.7 `optimizeDeps.include` の指定を維持する
    - `optimizeDeps.esbuildOptions` は未使用のため、`optimizeDeps.rolldownOptions` への移行作業は不要
    - _Requirements: 7.8_
  - [ ] 6.8 CommonJS default import の互換性を `pnpm preview` で確認する
    - 壊れている import があれば named import に書き換えて解消を試みる
    - それでも解消しない場合のみ `legacy.inconsistentCjsInterop: true` を期限付き TODO コメント付きで一時設定し、本 tasks.md に解除タスクを追記する
    - _Requirements: 7.9_
  - [ ] 6.9 UMD / IIFE / `output.format: 'system' | 'amd'` ライブラリビルドが存在しないことを `git grep -E "format:\\s*['\"](system|amd|umd|iife)['\"]"` で確認する
    - 該当なしを design.md に記録
    - _Requirements: 7.10_
  - [ ]\* 6.10 `pnpm chromatic:dryrun` を実行し、Storybook 10 のスナップショット生成が成功することを確認する
    - 既存ストーリーの visual diff 内容は本 spec のレビュー対象外
    - _Requirements: 7.11, 8.3_
  - [ ] 6.11 `dist` の gzip 後総 JS サイズを計測する
    - `find dist/assets -name '*.js' -exec gzip -c {} \; | wc -c` の合計を本 spec 開始時点と比較
    - ±5% 以内であることを確認。超過した場合は Manual Chunks 戦略を見直す（案 B → 案 A など）
    - _Requirements: 7.12_
  - [ ] 6.12 Vite 8 baseline target 判断を記録する
    - Vite 8 で `'baseline-widely-available'` の対象 Safari が 16.0 → 16.4 以上相当に引き上がることを確認
    - 本プロジェクトは Safari 16.0〜16.3 をサポート対象外として継続。`build.target` 明示は不要
    - サポート要件が変わっている場合のみ `build.target: ['safari16', 'chrome107', 'firefox104']` を明示
    - 判断結果（default のまま / 明示 target 設定）を design.md の「Vite 8 Baseline Target 判断」セクションに 1 文で追記
    - _Requirements: 7.13_
  - [ ] 6.13 PR8 共通検収を実行する（`pnpm build-storybook` まで含む）
    - _Requirements: 8.1, 8.2, 8.3_

- [ ] 7. CI / pre-commit / Storybook 回帰検証（Requirement 8、横断タスク）
  - [ ] 7.1 各 PR の最終コミット時点で以下を緑にする
    - `pnpm typecheck`
    - `pnpm lint`
    - `pnpm test`（カバレッジしきい値 50% 以上を維持）
    - `pnpm build`
    - `pnpm preview`（手動で TopPage / ChatPage を目視確認）
    - `pnpm storybook` 起動確認（PR6 では `pnpm build-storybook` まで実施）
    - _Requirements: 8.1_
  - [ ] 7.2 `lefthook` の pre-commit / pre-push フックを変更せずに緑で通過することを確認する
    - _Requirements: 8.2_
  - [ ] 7.3 全 PR マージ後、Node `v22 LTS` のクリーン環境で `pnpm install && pnpm build:prod` が完走することを 1 回確認する
    - _Requirements: 8.4_

## 切り戻し方針

- 各 PR は **完全に独立に revert 可能** であることが原則
- PR6 (Vite 8 + Storybook 10) のみ切り戻しコストが高いため、merge 後 7 日間は監視期間とし、本番 / Storybook の不具合報告があれば即座に revert する
- 切り戻し時は `package.json` / `pnpm-lock.yaml` / `vite.config.ts` / `lightningcss` devDep を同一コミットで revert する

## 他 spec との衝突回避

- [[spec-spa-perf]] の未完了 PR2-7 と `vite.config.ts` で衝突する可能性が高い
- 本 spec の PR5 / PR6 を [[spec-spa-perf]] の PR2 以降より **先行マージ** することを推奨
- 万一 [[spec-spa-perf]] の PR が先行した場合、本 spec の PR6 で `manualChunks` 戦略を再検討し、[[spec-spa-perf]] の Success Metric「chat 専用コードが initial bundle から外れる」を侵さないことを確認する
