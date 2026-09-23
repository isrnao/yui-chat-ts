# Requirements Document: post-deps-modernization-followup

## Introduction

`deps-modernization-vite8` spec (PR1 ~ PR6 + Copilot review fixes) を main にマージした後に残る、以下 3 件の後処理を 1 spec で扱う:

1. **RetroSplitter `top.type.name` 依存の解消** (production minify で壊れる pre-existing バグ。renewal / main 双方に存在し、PR1 で `useState` lazy initializer にも引用したため影響が拡大している)
2. **`vite-tsconfig-paths` 導入** (tsconfig の `paths` と `vite.config.ts` の `resolve.alias` で path mapping が二重管理されている状態を Single Source of Truth 化)
3. **Vitest 4 への昇格 + v8 coverage threshold 再設計 + `vite` overrides 解除** (deps spec PR5 で Vitest 4 の `v8` coverage `branches` 計測が 50% threshold を割って 3.x に固定した経緯の根本対処。`pnpm-workspace.yaml` の `vite: ^8.0.0` override も同時に解除可能)

deps-modernization-vite8 spec の Non-Goals に「新 API 採用は別 spec」「Vitest 4 移行は別 spec」と明記されており、本 spec はそれらの「別 spec」分の一部を担う。

### 現状の主要な前提

- `feature/deps-pr1-ts-eslint` に PR1 ~ PR6 の全コミット + B (`useResetOnChange`) + E (`usePreloadChatLogs` Suspense 化) + Copilot review 修正がマージ済み。本 spec はその状態を起点とする。
- React 19.2.6 / Vite 8.0.13 / Vitest 3.2.4 / TypeScript 6.0.3 / ESLint 10.4 / Storybook 10.4 / @vitejs/plugin-react 6.0.2 / pnpm 11.x。
- `tsconfig.app.json` の `paths` と `vite.config.ts` の `resolve.alias` は同じ `@features/*` / `@shared/*` を別表記で持つ (相対パス vs 絶対パス先頭)。
- `vite.config.ts` の `build.terserOptions.mangle.toplevel: true` は本番ビルドで関数名を mangle する設定。
- `src/features/chat/components/RetroSplitter/index.tsx` の `getTopTypeName(top, bottom)` が `top.type.name === 'ChatRoom'` でリテラル比較しており、production ビルドでは関数名が短縮されて常に false になる可能性。
- `pnpm-workspace.yaml` の `overrides: { vite: ^8.0.0 }` は Vitest 3.2.x が peer に Vite ^5||^6||^7 を要求するため二重インストールを防ぐ目的で入れた。Vitest 4.x は peer に `^6||^7||^8` を持つため不要になる見込み。
- Vitest 4 にすると本プロジェクトの `v8` coverage `branches` が 48.4% を計測 (Vitest 3 では 50%+ をクリア) し、`vite.config.ts` の `test.coverage.thresholds.branches: 50` 設定を割る。

## Glossary

- **RetroSplitter_TypeName_Probe**: `RetroSplitter` が子 `top` ノードの種類を `(top.type as Function).name === 'ChatRoom'` で判定する既存ロジック。本 spec で displayName 経由 or props 経由に置き換える対象。
- **Vite_TS_Paths_SSoT**: tsconfig の `paths` を Single Source of Truth とし、Vite 側 alias は `vite-tsconfig-paths` プラグインで自動同期する状態。
- **Vitest4_Branches_Drift**: Vitest 3 → 4 で v8 coverage の `branches` 計測ロジックが変わり、本プロジェクトでは約 2pt 低下 (50%+ → 48.4%) する事象。
- **Coverage_Threshold_Strategy**: `v8` coverage の `branches` threshold をどう扱うか。選択肢: (a) 引き下げ、(b) `v8` から `istanbul` に切替、(c) 不足分のテスト追加、(d) `branches` 除外のいずれか。
- **Vite_Override_Cleanup**: `pnpm-workspace.yaml` の `overrides: { vite: ^8.0.0 }` を Vitest 4 化に合わせて削除する作業。

## Requirements

### Requirement 1: RetroSplitter の `top.type.name` 依存解消

**User Story:** チャットルーム / なりきりルーム利用者として、production ビルドでも「ChatRoom 表示時 18%、EntryForm 表示時 26%」の初期分割比率が正しく適用されてほしい。terser の `mangle.toplevel: true` で関数名が短縮されると現実装は壊れる。

#### Acceptance Criteria

1. THE `src/features/chat/components/RetroSplitter/index.tsx` SHALL `top.type.name === 'ChatRoom'` のリテラル比較に依存しない方式で初期高さを決定する。次のいずれかを採用する:
   - (a) `topInitialPercent?: number` prop を `RetroSplitter` に追加し、呼び出し側 (`ChatRoute` 等) が `entered ? 18 : 26` を明示で渡す。
   - (b) `RetroSplitter` が「ChatRoom 表示中フラグ」相当を `boolean` で受け取る (`isChatRoom?: boolean`)。
   - (c) `ChatRoom` および `EntryForm` に `displayName` を明示し、`top.type.name` ではなく `(top.type as ComponentType).displayName ?? (top.type as Function).name` を参照して、production minify の `keep_fnames` も同時に検討する。
2. THE 採択した方式 SHALL `vite.config.ts` の `build.terserOptions.mangle.toplevel: true` 設定下で `pnpm build && pnpm preview` を実行し、ChatRoom 入室前 (EntryForm 表示) で `topHeight ≈ 26%`、入室後 (ChatRoom 表示) で `topHeight ≈ 18%` になることを実 DOM で確認する。
3. THE 既存の `src/features/chat/components/RetroSplitter/RetroSplitter.test.tsx` SHALL 緑を維持する。テストが内部的に `function ChatRoom() {...}` 等のリテラル名比較に依存している場合は採択した方式に追従するテストへ書き換える。
4. THE 本 PR SHALL `vite.config.ts` の `build.terserOptions.mangle.toplevel` 設定を変更しない (パフォーマンス目的の既存指定を維持)。やむを得ず変更する場合 ((c) 案の `keep_fnames` 追加等) は、bundle gzip size の差分を計測して design.md に記録する。
5. THE 採択した方式 SHALL `ChatRoute.tsx` のみ呼び出し側修正で済むこと。`ChanariChatPage.tsx` 等の他の RetroSplitter 利用箇所 (存在する場合) も同時更新する。

### Requirement 2: `vite-tsconfig-paths` 導入による path mapping SSoT 化

**User Story:** 開発者として、`@features/*` / `@shared/*` などの path alias を tsconfig だけで管理し、`vite.config.ts` 側の手書き alias を削除して二重管理を解消したい。

#### Acceptance Criteria

1. THE `package.json` SHALL `vite-tsconfig-paths` を devDependency に追加する (`^6.x` 系の最新。spec 着手時点で 6.1.1。peer は `vite: '*'` で Vite 8 対応)。
2. THE `vite.config.ts` SHALL `plugins` 配列に `tsconfigPaths()` を追加し、既存の `resolve.alias` セクション全体を削除する。
3. WHEN `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build-storybook` を実行する, THE 各コマンド SHALL 緑で完了する。特に `vendor-react` / `vendor-supabase` の chunk 命名が PR6 後と同一であること (manualChunks は影響を受けないため変化なしを期待)。
4. WHEN `pnpm preview` を起動して `/` および `/chat/superbeginner` にアクセスする, THE 開発者 SHALL Console エラー / module not found が出ないことを確認する。
5. THE Storybook の `.storybook/main.ts` SHALL `viteFinal` 経由で `tsconfigPaths()` が適用されることを `pnpm storybook` 起動 + 任意 story 描画で確認する。
6. THE 採用した `vite-tsconfig-paths@^6` SHALL Vite 8 で動作することを `pnpm install` の peer 解決と `pnpm build` の成功で確認する (peer は `vite: '*'` で範囲広め)。

### Requirement 3: Vitest 4 への昇格 + coverage threshold 再設計 + Vite override 解除

**User Story:** 開発者として、Vitest を最新の 4.x にして将来の Vitest 機能 / セキュリティ修正を取り込み、`pnpm-workspace.yaml` の `vite` override (Vitest 3 由来の暫定対応) を解除したい。同時に Vitest 4 で計測値が変わる `v8` coverage の `branches` threshold 50% 維持を達成する。

#### Acceptance Criteria

1. THE `package.json` SHALL `vitest` / `@vitest/coverage-v8` / `@vitest/ui` を `^4.x` (本 spec 着手時点の最新) に揃える。
2. WHEN Vitest 4 で `pnpm test` を実行する, THE coverage `branches` の計測結果 SHALL `vite.config.ts` の `test.coverage.thresholds.branches: 50` をクリアする。クリアできない場合は次のいずれかを採用する:
   - (a) `test.coverage.provider` を `'v8'` から `'istanbul'` に切り替えて再計測 (`@vitest/coverage-istanbul` の導入が必要)
   - (b) 不足箇所に **意味のあるテスト**を追加して `branches` をクリア (定数 export 等を狙い撃ちする tautology テストは禁止)
   - (c) `branches` threshold を 45% に引き下げ、リグレッションを許容する判断を design.md に記録
     採択した方針 (a/b/c) と理由を design.md の「Coverage_Threshold_Strategy 採択結果」セクションに 1 段落で追記する。
3. THE `pnpm-workspace.yaml` SHALL Vitest 4 移行と同コミットで `overrides: { vite: ^8.0.0 }` を削除する (Vitest 4 の peer 解決で Vite 8 が単一インストールされることを `ls node_modules/.pnpm | grep ^vite@` で確認)。
4. THE `vite.config.ts` SHALL Vitest 4 の `test` 設定スキーマ変更に追従する (例: `test.coverage.exclude` / `test.environment` 等の rename / 削除があれば対応)。Vitest 4 の deprecated 警告が `pnpm test` 標準出力に出ないこと。
5. WHEN `pnpm test` 全件 / `pnpm typecheck` / `pnpm lint` / `pnpm build` / `pnpm build-storybook` を実行する, THE 各コマンド SHALL 緑で完了する。
6. THE 本 PR SHALL Requirement 2 と独立に進められる (Requirement 2 が未マージでも本 PR を進められる)。ただし両 PR を同 base ブランチに乗せる場合、`vite.config.ts` の `resolve.alias` 削除 (Req 2) と `test.coverage` 設定変更 (Req 3) が同一ファイルで衝突する可能性があるため、マージ順序を design.md で明示する。

### Requirement 4: 横断検証

**User Story:** メンテナとして、各 Requirement の PR を取り込む直前に主要コマンドが緑であることを機械的に保証したい (deps-modernization-vite8 spec Requirement 8 と同様の制約)。

#### Acceptance Criteria

1. WHEN 各 Requirement の最終コミット時点で以下を実行する, THE 全コマンド SHALL 緑で完了する:
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test` (Requirement 3 で再設計した threshold をクリア)
   - `pnpm build`
   - `pnpm preview` (Requirement 1 では実 DOM で topHeight も目視確認)
   - `pnpm build-storybook` (Requirement 2 では viteFinal の挙動も確認)
2. WHEN `lefthook` の pre-commit / pre-push フックが存在する, THE 各 PR SHALL フック設定を変更せずに緑で通過する。
3. THE 本 spec の全 Requirement の PR マージ後, THE プロジェクト SHALL Node `v22 LTS` で `rm -rf node_modules && pnpm install && pnpm build:prod` がクリーン環境で完走する。

## Non-Goals

- **deps-modernization-vite8 spec の手動 smoke test (Realtime / Auth / Chromatic dry-run)**: それらは [[spec-deps-modernization-vite8]] の `*` 付き optional task として残置。本 spec の対象外。
- **React 19.2 の他の新 API 採用 (`useEffectEvent` / `<Activity />` 等)**: 別 spec (例: `react-19-api-adoption`) を立てて扱う。本 spec では扱わない。
- **`build.terserOptions.mangle.toplevel` の方針変更**: Requirement 1.4 で「変更しない」を明示。Bundle size 改善目的の terser 設定見直しは別タスク。
- **rolldown 互換層からの脱却 (`rollupOptions` → `rolldownOptions` 移行)**: 本プロジェクトは Vite 8 互換層を当面利用する方針 ([[spec-deps-modernization-vite8]] Non-Goals)。本 spec も同方針を継承。
- **テスト coverage の積極的向上**: Requirement 3.2 (b) で「意味のあるテスト追加」を許容するが、本 spec の目的は **threshold 維持**であり、coverage 拡大を目標としない。

## Success Metrics

### 必須

- [ ] `pnpm build && pnpm preview` 経由で RetroSplitter 初期高さが ChatRoom 表示時 18% / EntryForm 表示時 26% であることを実 DOM (DevTools Elements の computed height) で目視確認できる。
- [ ] `vite.config.ts` の `resolve.alias` ブロックが削除され、tsconfig が path mapping の Single Source of Truth になる。
- [ ] Vitest 4.x がインストールされ、`pnpm-workspace.yaml` の `vite` override が削除される。
- [ ] `pnpm test` の coverage `branches` が `vite.config.ts` の threshold 設定をクリアする (threshold 引き下げの場合は design.md に記録)。
- [ ] 全 Requirement の最終コミット時点で `typecheck` / `lint` / `test` / `build` / `build-storybook` が緑。

### 推奨

- [ ] Vitest 4 で `pnpm test` の wall-clock 時間が Vitest 3 比で同等以上 (大きな悪化なし)。
- [ ] `vite-tsconfig-paths` 導入後の `pnpm dev` 起動時間が変化なし (alias 解決の負荷が誤差以内)。
- [ ] RetroSplitter の Requirement 1 対応で `ChatRoom` / `EntryForm` の `displayName` 明示を採用した場合、他コンポーネントの React DevTools 表示も同水準で readable になっていることを 1 回確認する。

### 観測のみ (合否判定しない)

- Vitest 4 移行で `dist` のテストハーネス影響は出ないが、`node_modules` install サイズが Vitest 内部依存変化で ±数 MB 変動する可能性を 1 回計測する。
