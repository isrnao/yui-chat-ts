# Implementation Plan: text-based-header

## Overview

お気楽チャットのトップページヘッダーを、画像アセットを一切使わず TypeScript + React + CSS（CSS カスタムプロパティ + グラデーション + インライン SVG）のみで再現する実装計画である。`design.md` と `requirements.md` を土台に、段階的に「データ追加 → スタイルトークン → アイコン → サブコンポーネント → ルート Header → TopPage 統合 → プロパティベーステスト」の順で差分を積み上げ、最後に既存 `TopPage` への配線で画像参照を完全に取り除く。

実装で扱うのは以下のファイルのみ:

- 新規: `src/features/top/components/header/headerTheme.css`
- 新規: `src/features/top/components/header/icons.tsx`
- 新規: `src/features/top/components/header/Header.tsx`
- 新規: `src/features/top/components/header/__tests__/Header.properties.test.tsx`
- 新規（任意）: `src/features/top/components/header/Header.stories.tsx`
- 変更: `src/features/top/data.ts`（`GuideIconKind` / `guideIcons` を追加）
- 変更: `src/features/top/TopPage.tsx`（内部 `Header` 関数を削除し、新 `Header` を import）

依存関係追加はなし（`fast-check` は既に `devDependencies` に導入済み、`vitest` + `@testing-library/react` も同様）。プロパティベーステストは `react-dom/server` の `renderToStaticMarkup` で HTML 文字列を生成し、構造・属性・クラスを検査する方式で統一する。

## Tasks

- [x] 1. データ層: `GuideIconKind` 型と `guideIcons` 配列を追加
  - [x] 1.1 `data.ts` に `GuideIconKind` 型と `guideIcons` 配列を export する
    - `src/features/top/data.ts` に次を追記する:
      - `export type GuideIconKind = 'faq' | 'tutorial' | 'heart' | 'profile' | 'mail';`
      - `export const guideIcons: readonly GuideIconKind[] = ['faq', 'tutorial', 'heart', 'profile', 'mail'] as const;`
    - `guideIcons` の順序は既存 `guideLinks`（FAQ → 使い方 → ルール・マナー → プロフィール作成 → コンタクト）とインデックス対応させる
    - 既存 `guideLinks` / `primaryNav` / `tabNav` は**変更しない**
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]\* 1.2 `guideIcons.length === guideLinks.length` のユニットテストを追加
    - テストファイル: `src/features/top/__tests__/data.test.ts`
    - `guideIcons.length` が `guideLinks.length` と等しいことを検証
    - 実行時に不整合が発生した場合、どのインデックスが欠けているかを含む説明的エラーで失敗させる
    - _Requirements: 6.5, 6.7_

- [x] 2. スタイルトークン: `headerTheme.css` を作成
  - [x] 2.1 `src/features/top/components/header/headerTheme.css` に `.ochat-header` スコープで CSS カスタムプロパティを定義
    - `design.md` の「視覚トークン」節に掲載された 24 個すべてのカスタムプロパティを `.ochat-header { ... }` 内で宣言する
    - 以下の値はユーザー提供のスポイトサンプリング値と**完全一致**させる:
      - `--ochat-h-logo-text: #0167ff;`
      - `--ochat-h-seam: #006cff;`
      - `--ochat-h-primary-tab-active-bg-top: #0099ff;` / `--ochat-h-primary-tab-active-bg-btm: #016fff;`
      - `--ochat-h-primary-tab-active-fg: #ffffff;`
      - `--ochat-h-primary-tab-bg-top: #fefefe;` / `--ochat-h-primary-tab-bg-btm: #e8e8e8;`
      - `--ochat-h-primary-tab-fg: #333333;`
      - `--ochat-h-secondary-bar-top: #0bbbfe;` / `--ochat-h-secondary-bar-btm: #068ae3;`
      - `--ochat-h-secondary-tab-active-bg: #ffffff;` / `--ochat-h-secondary-tab-active-fg: #333333;`
      - `--ochat-h-secondary-tab-fg: #ffffff;`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [x] 2.2 各セクションのレイアウト/配色/グラデーション CSS を記述する
    - `.ochat-header__top`（ロゴ＋ガイド、`display: flex` + `space-between` + `max-width: 990px` + `margin: 0 auto`）
    - `.ochat-header__logo` / `__logo-wing` / `__logo-texts` / `__logo-url` / `__logo-title`
    - `.ochat-header__guide` / `__guide-list` / `__guide-item` / `__guide-link`（hover 色切り替え）/ `__guide-icon`
    - `.ochat-header__primary` / `__primary-list`（`display: flex; flex-wrap: nowrap; overflow-x: auto`）/ `__primary-item` / `__primary-tab` / `__primary-tab--active`
    - `.ochat-header__seam`（`height: 4px; background: var(--ochat-h-seam);`）
    - `.ochat-header__secondary` / `__secondary-list`（`flex-wrap: nowrap; overflow-x: auto`）/ `__secondary-item` / `__secondary-tab` / `__secondary-tab--active`
    - `background-image: url(...)` と画像参照は**一切書かない**。背景はすべて単色または `linear-gradient(...)` で表現する
    - _Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 3.5, 3.6, 5.3, 5.4, 5.5, 5.6_

  - [x] 2.3 レスポンシブ指定（`@media (max-width: 767px)`）を追加
    - `@media (max-width: 767px) { .ochat-header__top { flex-direction: column; } }` を定義する
    - デスクトップ幅では `.ochat-header__top` は `flex-direction: row` が既定として効く
    - _Requirements: 5.1, 5.2_

  - [ ]\* 2.4 `headerTheme.css` のソース文字列に対する単体テストを追加
    - テストファイル: `src/features/top/components/header/__tests__/headerTheme.css.test.ts`
    - `fs.readFileSync` で `headerTheme.css` を読み込み、Requirements 2.1〜2.9 の各色値リテラルが存在することを assert
    - `@media (max-width: 767px)` / `overflow-x: auto` / `flex-wrap: nowrap` が含まれることを assert
    - _Requirements: 2.1-2.9, 5.1-5.6_

- [x] 3. アイコン: `icons.tsx` の WingIcon と GuideIcon を実装
  - [x] 3.1 `src/features/top/components/header/icons.tsx` に `WingIcon` を追加
    - `SVGProps<SVGSVGElement>` ベースで `size?: number`（既定 42）を受け取る
    - `viewBox="0 0 40 40"`、2 枚の翼 `<path>` + 中央陰影 `<path>` の 3 層構成
    - `fill` 属性は `var(--ochat-h-logo-wing)` / `var(--ochat-h-logo-wing-shadow)` のみ。ハードコード色値を使わない
    - 返り値のルート `<svg>` に `aria-hidden="true"` を必ず付与する
    - _Requirements: 1.4, 4.7, 2.10_

  - [x] 3.2 同ファイルに `GuideIcon` と `GuideIconKind` 型（型は `data.ts` から import して再 export）を追加
    - `function GuideIcon({ kind, className }: { kind: GuideIconKind; className?: string })` シグネチャ
    - 全分岐で `viewBox="0 0 16 16"`、`width={14}`、`height={14}`、`aria-hidden="true"` を付与する
    - 分岐ごとの形状と色:
      - `faq`: `?` 入り吹き出し、`fill: var(--ochat-h-guide-icon-pink)`
      - `tutorial`: 本型の矩形＋罫線、`fill: var(--ochat-h-guide-icon-orange)`
      - `heart`: ハート、`fill: var(--ochat-h-guide-icon-pink)`
      - `profile`: 円＋胴体、`fill: var(--ochat-h-guide-icon-green)`
      - `mail`: 封筒矩形＋折り返し線、`fill: var(--ochat-h-guide-icon-blue)`
    - TypeScript 判別ユニオンの網羅性チェックにより、未知の `kind` は型エラーで検出される構造にする
    - _Requirements: 1.4, 2.10, 4.7, 6.4, 8.8_

  - [ ]\* 3.3 `WingIcon` / `GuideIcon` のスナップショットテストを追加
    - テストファイル: `src/features/top/components/header/__tests__/icons.test.tsx`
    - `WingIcon()` および 5 種すべての `GuideIcon`（`faq` / `tutorial` / `heart` / `profile` / `mail`）を `renderToStaticMarkup` でシリアライズし、スナップショット比較する
    - すべての出力が `<svg` から始まり `aria-hidden="true"` を含むことを追加で assert
    - _Requirements: 1.4, 4.7, 8.8_

- [x] 4. サブコンポーネントとルート Header を `Header.tsx` に実装
  - [x] 4.1 `src/features/top/components/header/Header.tsx` を新規作成し、`headerTheme.css` を import する
    - 冒頭で `import './headerTheme.css';` を記述（副作用 import）
    - `import { guideLinks, guideIcons, primaryNav, tabNav } from '../../data';` を追加
    - `import { GuideIcon, WingIcon } from './icons';` および `import type { GuideIconKind } from '../../data';` を追加
    - _Requirements: 6.1, 6.2_

  - [x] 4.2 `LogoBlock` サブコンポーネントを実装
    - ルートは `<a className="ochat-header__logo" href={import.meta.env.BASE_URL} aria-label="お気楽チャット トップへ">`
    - 中身は `<WingIcon className="ochat-header__logo-wing" />` と、`ochat-header__logo-texts` 配下の `ochat-header__logo-url`（`www.okiraku-chat.com`）、`ochat-header__logo-title`（`お気楽チャット`）の 2 つの `<span>`
    - `<img>` / `background-image: url(...)` を使わない
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.4, 4.6, 4.7_

  - [x] 4.3 `GuideMenu` サブコンポーネントを実装
    - Props: `items: readonly { label: string; iconKind: GuideIconKind; href: string }[]`
    - ルートは `<nav aria-label="ガイドメニュー" className="ochat-header__guide">` → `<ul className="ochat-header__guide-list">`
    - 各 `<li className="ochat-header__guide-item">` 内に `<a className="ochat-header__guide-link" href={item.href}>` + `<GuideIcon kind={item.iconKind} className="ochat-header__guide-icon" />` + `<span>{item.label}</span>`
    - 各アイコンは `aria-hidden="true"` を保持
    - _Requirements: 1.4, 4.7, 4.8, 6.6_

  - [x] 4.4 `PrimaryTabs` サブコンポーネントを実装
    - Props: `items: readonly string[]; activeIndex: number`
    - ルートは `<nav aria-label="メインナビゲーション" className="ochat-header__primary">` → `<ul className="ochat-header__primary-list">`
    - 各項目で `const isActive = index === activeIndex;` を計算し、`className` は `'ochat-header__primary-tab' + (isActive ? ' ochat-header__primary-tab--active' : '')`
    - `aria-current="page"` は `isActive` のみに付与（そうでなければ属性ごと省略）
    - `<a href="#">` で描画（本 spec ではルーティング未確定のためプレースホルダー）
    - _Requirements: 3.5, 4.1, 4.3, 4.9, 8.1, 8.3, 8.7_

  - [x] 4.5 `SecondaryTabs` サブコンポーネントを実装
    - Props: `items: readonly { label: string; href: string }[]; activeIndex: number`
    - ルートは `<nav aria-label="チャット種別タブ" className="ochat-header__secondary">` → `<ul className="ochat-header__secondary-list">`
    - 各項目で `isActive` 計算 → `ochat-header__secondary-tab` に `--active` を追加、`aria-current="page"` を活性項目のみ付与、`href={item.href}`
    - _Requirements: 3.6, 4.2, 4.4, 4.10, 8.2, 8.3, 8.7_

  - [x] 4.6 ルート `Header` 関数をまとめる
    - `export function Header(): ReactNode { ... }` として export
    - モジュール内で `guideItems = guideLinks.map((label, i) => ({ label, iconKind: guideIcons[i], href: '#' }))` を組み立て
    - 返す JSX は次の順:
      1. `<header className="ochat-header">`
      2. `<div className="ochat-header__top">` 配下に `<LogoBlock />` と `<GuideMenu items={guideItems} />`
      3. `<PrimaryTabs items={primaryNav} activeIndex={0} />`
      4. `<div className="ochat-header__seam" aria-hidden="true" />`
      5. `<SecondaryTabs items={tabNav} activeIndex={0} />`
    - ファイル内に `#0167ff` / `#006cff` などの色リテラルを書かない（色はすべて CSS 経由）
    - _Requirements: 3.1, 3.2, 3.3, 4.5, 1.1, 1.2, 1.3, 2.10_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. プロパティベーステスト: Correctness Properties 1〜9 を fast-check で検証
  - [ ]\* 6.1 テストユーティリティを準備
    - 新ファイル: `src/features/top/components/header/__tests__/Header.properties.test.tsx`
    - `renderToStaticMarkup`（`react-dom/server`）、`fc`（`fast-check`）、`describe` / `it` / `expect`（`vitest`）を import
    - ヘルパー関数を同ファイル内で定義:
      - `occurrences(html: string, substr: string): number`
      - `extractAnchors(html: string): string[]`（`<a ...>...</a>` の開きタグ文字列を順に抽出）
      - `extractSvgOpenTags(html: string): string[]`（`<svg ...>` の開きタグ文字列を抽出）
      - `extractListItems(html: string, className: string): string[]`（指定クラス名を持つ `<li>...</li>` を抽出）
    - テスト名は日本語記述（プロジェクト規約）とする
    - _Requirements: 8.1-8.8_

  - [ ]\* 6.2 Property 1 を実装
    - **Property 1: No `<img>` tag in rendered output**
    - **Validates: Requirements 1.1, 1.5**
    - `renderToStaticMarkup(<Header />)` の結果に `/<img\b/i` が 0 件であることを assert
    - `numRuns: 100`（`fc.constant` を使い副作用なしのレンダリングを 100 回繰り返す）

  - [ ]\* 6.3 Property 2 を実装
    - **Property 2: No `background-image: url(...)` nor `okiraku/images/` reference**
    - **Validates: Requirements 1.2, 1.3, 1.5, 7.3**
    - `/background-image\s*:\s*url\(/i` と `'okiraku/images/'` のいずれも含まれないことを assert

  - [ ]\* 6.4 Property 3 を実装
    - **Property 3: Four-row header structure with ochat-header root and single seam**
    - **Validates: Requirements 3.1, 3.2, 3.3, 7.4**
    - `class="ochat-header"` が 1 回、`ochat-header__seam` が 1 回含まれ、`ochat-header__top` → `ochat-header__primary` → `ochat-header__seam` → `ochat-header__secondary` の順で出現することを assert

  - [ ]\* 6.5 Property 4 を実装
    - **Property 4: PrimaryTabs active exclusivity across all valid activeIndex values**
    - **Validates: Requirements 4.1, 4.3, 4.5, 8.1, 8.3, 8.7**
    - `fc.integer({ min: 0, max: primaryNav.length - 1 })` を入力に、`<PrimaryTabs items={primaryNav} activeIndex={i} />` を 100 回レンダリング
    - `ochat-header__primary-tab--active` が 1 件、`aria-current="page"` が 1 件、`i` 番目の `<a>` のみに両方が付与されていることを assert

  - [ ]\* 6.6 Property 5 を実装
    - **Property 5: SecondaryTabs active exclusivity across all valid activeIndex values**
    - **Validates: Requirements 4.2, 4.4, 4.5, 8.2, 8.3, 8.7**
    - `fc.integer({ min: 0, max: tabNav.length - 1 })` を入力に、`<SecondaryTabs items={tabNav} activeIndex={i} />` を 100 回レンダリング
    - `ochat-header__secondary-tab--active` と `aria-current="page"` がそれぞれ 1 件、`i` 番目の `<a>` に集中していることを assert

  - [ ]\* 6.7 Property 6 を実装
    - **Property 6: All navigation labels appear in rendered output in declared order**
    - **Validates: Requirements 3.5, 3.6, 8.4, 8.5, 8.6**
    - `renderToStaticMarkup(<Header />)` の結果に `primaryNav[i]` / `tabNav[i].label` / `guideLinks[i]` が配列順で出現することを cursor 走査で assert

  - [ ]\* 6.8 Property 7 を実装
    - **Property 7: guideLinks / guideIcons length parity and index-paired rendering**
    - **Validates: Requirements 6.3, 6.5, 6.6, 6.7**
    - `guideLinks.length === guideIcons.length` を assert
    - `<GuideMenu items={...} />` の各 `<li>` 要素が `guideLinks[i]` を含み、`<svg` を含み、`guideIcons[i]` に対応する識別子（`faq` の `?`、`tutorial` の `<rect`、`heart` の特定 `path d=` シグネチャ、`profile` の `<circle`、`mail` の `<path d="M1.5 4` など）を含むことを assert する `matchesIconKind` を実装

  - [ ]\* 6.9 Property 8 を実装
    - **Property 8: GuideIcon returns `<svg viewBox="0 0 16 16">` for every GuideIconKind**
    - **Validates: Requirements 1.4, 8.8**
    - `fc.constantFrom<GuideIconKind>('faq', 'tutorial', 'heart', 'profile', 'mail')` を入力に 100 回
    - 戻り値 HTML が `<svg` で始まり、`viewBox="0 0 16 16"` を含むことを assert

  - [ ]\* 6.10 Property 9 を実装
    - **Property 9: All decorative icons carry `aria-hidden="true"`**
    - **Validates: Requirements 4.7**
    - `<Header />` の出力から `<svg ...>` 開きタグを全抽出し、どれも `aria-hidden="true"` を持つことを assert

- [x] 7. TopPage.tsx の内部 Header 関数を新 Header コンポーネントで差し替え
  - [x] 7.1 `TopPage.tsx` から内部 `Header` 関数を削除し、import に置き換える
    - ファイル先頭付近に `import { Header } from './components/header/Header';` を追加
    - 既存の `function Header()` 関数本体（`imageBase`, `headerStyle`, `guideIcons`（ローカル）, `<header className="bg-white" style={headerStyle}>` を含むブロック）をファイルから削除
    - `TopPage` 関数内で `<Header />` を既存位置（ルート `<div>` の最初の子）としてそのまま参照し続ける
    - 既存の `useSEO` / `usePageView` / `useRoomCounts` 呼び出しと、`main` 以下のレイアウトは**変更しない**
    - 未使用になった `import type { CSSProperties }` を必要に応じて除去（他で未使用の場合のみ）
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]\* 7.2 統合テストを更新/追加
    - 既存 `src/features/top/TopPage.test.tsx` が存在する場合、`renderToStaticMarkup(<TopPage />)` の結果に以下が**含まれない**ことを assert する例示テストを追加:
      - `okiraku/images/logo.png`
      - `okiraku/images/head.png`
      - `okiraku/images/navi.png`
      - `okiraku/images/faq.png`
      - `<img`（ヘッダー領域スコープで確認、main 以下に `<img>` がある場合はそのままでよい）
    - 同じテストで `class="ochat-header"` が 1 件含まれることを確認
    - _Requirements: 7.3, 7.4_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. ユニットテストと任意の Storybook story
  - [ ]\* 9.1 `Header` のランドマーク/文言ユニットテストを追加
    - テストファイル: `src/features/top/components/header/__tests__/Header.test.tsx`
    - `@testing-library/react` の `render` + `screen.getByRole`/`screen.getByText` で以下を確認:
      - ランドマーク `<header>` が 1 つ存在
      - `お気楽チャット` と `www.okiraku-chat.com` の両文字列が表示
      - `<nav aria-label="ガイドメニュー">` / `<nav aria-label="メインナビゲーション">` / `<nav aria-label="チャット種別タブ">` が存在
      - `ロゴのリンクに aria-label="お気楽チャット トップへ" が付く`
    - _Requirements: 3.4, 4.6, 4.8, 4.9, 4.10_

  - [ ]\* 9.2 `Header.stories.tsx` を追加（任意）
    - ファイル: `src/features/top/components/header/Header.stories.tsx`
    - `Default` ストーリーで `<Header />` を単独表示
    - Storybook の viewport を `mobile1` (320px) / `tablet` (768px) / `desktop` (1280px) で切り替えられるように `parameters.viewport.defaultViewport` を `'desktop'` に設定
    - 画像参照がない（ネットワークタブにリクエストが 0 件）ことを目視確認する用途
    - _Requirements: 5.1, 5.2_

- [x] 10. 最終 Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- `*` で postfix された sub-task は optional で、MVP 最短コースではスキップ可能。コア実装（1.1, 2.1, 2.2, 2.3, 3.1, 3.2, 4.1〜4.6, 7.1）とチェックポイント（5, 8, 10）はスキップ不可。
- 各タスクは対応する Requirements 節を `_Requirements: X.Y_` で明示し、Property タスクは `design.md` の Property N を参照する。
- Property タスク 6.2〜6.10 はそれぞれ独立した `it(...)` ブロックとして実装し、`fc.assert` 内の `numRuns: 100` を明記する。タスクごとに失敗時の反例（counterexample）が個別に表示されるようにする。
- `pnpm test` は vitest 単発実行（`vitest --run`）で回すこと。watch モードは使用しない。
- 既存 `src/App.css` の `.okiraku-header` / `.okiraku-primary-tab` / `.okiraku-secondary-tab` は本 spec では削除しない（out-of-scope）。
- 本 workflow は設計・計画アーティファクト作成のみが対象。タスク実行は `tasks.md` の各 "Start task" ボタンから行う。
