# Requirements Document

## Introduction

本ドキュメントは、お気楽チャットのトップページヘッダー領域（ロゴ、ガイドメニュー、1 段目プライマリタブ、濃青 Seam、2 段目セカンダリタブ）を画像アセットに一切依存せずテキストと CSS のみで再現する機能 `text-based-header` の要件を定義する。配色はユーザーがスポイトでサンプリングした具体値と完全一致させ、既存 `src/features/top/data.ts` の `primaryNav` / `tabNav` / `guideLinks` をデータソースとして再利用し、既存 `TopPage.tsx` の内部 `Header` 関数を差し替える形で統合する。

本要件は `.kiro/specs/text-based-header/design.md`（確定済み）から派生しており、設計で確定した色トークン・DOM 構造・CSS 実装・コンポーネント分割と整合する。実装が正しいことを自動検証可能にするため、プロパティベーステスト（PBT）で検査可能な形式で要件を記述する。

## Glossary

- **Header_Component**: `src/features/top/components/header/Header.tsx` が export する `Header` 関数コンポーネント。ヘッダーのルート `<header className="ochat-header">` を返す。
- **LogoBlock**: ロゴ領域サブコンポーネント。翼型インライン SVG、URL キャプション、大文字青色タイトル「お気楽チャット」を描画する。
- **GuideMenu**: ガイドメニュー領域サブコンポーネント。`guideLinks` × `guideIcons` を zip した 5 項目のアイコン付きリンク行を描画する。
- **PrimaryTabs**: 1 段目タブ行サブコンポーネント。`primaryNav` の 9 項目を白〜薄グレーグラデ背景で並べ、アクティブ項目のみ青グラデで塗る。
- **SecondaryTabs**: 2 段目タブ行サブコンポーネント。`tabNav` の 7 項目を水色グラデ背景で並べ、アクティブ項目のみ白背景で塗る。
- **Seam**: 1 段目と 2 段目の間に挟まる濃青 `#006CFF` の細帯 `<div className="ochat-header__seam" aria-hidden="true" />`。
- **HeaderTheme**: 色定義 CSS ファイル `src/features/top/components/header/headerTheme.css`。`.ochat-header` スコープで CSS カスタムプロパティを宣言する。
- **GuideIconKind**: `'faq' | 'tutorial' | 'heart' | 'profile' | 'mail'` の判別ユニオン型。ガイドメニューのアイコン種別を表す。
- **guideIcons**: `data.ts` に追加される `readonly GuideIconKind[]` 配列。`guideLinks` と同じ順序・同じ長さで、インデックス対応でアイコン種別を保持する。
- **TopPage**: `src/features/top/TopPage.tsx`。お気楽チャットのトップページを描画するルートコンポーネント。
- **Active_Index**: タブ行の中でアクティブ状態の項目のインデックス（`0` 始まり）。本機能では初期値として PrimaryTabs / SecondaryTabs とも `0` を設定する。
- **Rendered_Output**: `renderToStaticMarkup(<Header />)` で得られる静的 HTML 文字列。

## Requirements

### Requirement 1: 画像アセット非依存描画 (No Images)

**User Story:** 開発者として、ヘッダーを画像アセットに依存させず、テキストと CSS だけで描画したい。そうすれば、アセット配信コストを削減でき、ロゴ画像ファイルの破損・欠損リスクを排除できる。

#### Acceptance Criteria

1. THE Header_Component SHALL render without any `<img>` element in Rendered_Output.
2. THE Header_Component SHALL render without any `background-image: url(...)` declaration in Rendered_Output.
3. THE Header_Component SHALL render without importing or referencing any file under `public/okiraku/images/` (including `logo.png`, `head.png`, `navi.png`, `faq.png`, `tutorial.png`, `heart.png`, `profile.png`, `email.gif`).
4. WHERE the翼型アイコン or ガイドメニューアイコン is displayed, THE Header_Component SHALL render it as an inline `<svg>` element defined in `src/features/top/components/header/icons.tsx`.
5. IF an external SVG file or raster image reference is introduced into the Header_Component, THEN THE Header_Component SHALL fail a rendering property test that asserts the absence of such references.

### Requirement 2: 配色の忠実再現（Fidelity of Color Tokens）

**User Story:** デザイナーとして、ユーザーがスポイトでサンプリングした配色値をヘッダーに完全一致させたい。そうすれば、レガシーサイトの視覚的印象を維持しながら画像を取り除ける。

#### Acceptance Criteria

1. THE HeaderTheme SHALL define `--ochat-h-logo-text` as exactly `#0167ff`.
2. THE HeaderTheme SHALL define `--ochat-h-seam` as exactly `#006cff`.
3. THE HeaderTheme SHALL define `--ochat-h-primary-tab-active-bg-top` as exactly `#0099ff` and `--ochat-h-primary-tab-active-bg-btm` as exactly `#016fff`.
4. THE HeaderTheme SHALL define `--ochat-h-primary-tab-active-fg` as exactly `#ffffff`.
5. THE HeaderTheme SHALL define `--ochat-h-primary-tab-bg-top` as exactly `#fefefe` and `--ochat-h-primary-tab-bg-btm` as exactly `#e8e8e8`.
6. THE HeaderTheme SHALL define `--ochat-h-primary-tab-fg` as exactly `#333333`.
7. THE HeaderTheme SHALL define `--ochat-h-secondary-bar-top` as exactly `#0bbbfe` and `--ochat-h-secondary-bar-btm` as exactly `#068ae3`.
8. THE HeaderTheme SHALL define `--ochat-h-secondary-tab-active-bg` as exactly `#ffffff` and `--ochat-h-secondary-tab-active-fg` as exactly `#333333`.
9. THE HeaderTheme SHALL define `--ochat-h-secondary-tab-fg` as exactly `#ffffff`.
10. THE HeaderTheme SHALL be the single source of truth for these colors, meaning THE Header_Component SHALL NOT include hard-coded hex literals for any of the tokens listed in 2.1 through 2.9 in JSX inline styles or Tailwind utility classes.

### Requirement 3: 4 段構成のレイアウト（Four-Row Structure）

**User Story:** エンドユーザーとして、ロゴ＋ガイド、プライマリタブ、濃青細帯、セカンダリタブの 4 段構成でヘッダーが表示されてほしい。そうすれば、レガシーサイトと同等のナビゲーション構造を保てる。

#### Acceptance Criteria

1. WHEN THE Header_Component renders, THE Header_Component SHALL output a root `<header>` element with `className` equal to `"ochat-header"`.
2. WHEN THE Header_Component renders, THE Header_Component SHALL output its children in the following order inside the root `<header>`: (a) `<div className="ochat-header__top">` containing LogoBlock and GuideMenu, (b) PrimaryTabs, (c) Seam, (d) SecondaryTabs.
3. WHEN THE Header_Component renders, THE Header_Component SHALL output exactly one element with `className` containing `"ochat-header__seam"` and with attribute `aria-hidden="true"` between PrimaryTabs and SecondaryTabs.
4. THE LogoBlock SHALL render the literal string `お気楽チャット` as the logo title and the literal string `www.okiraku-chat.com` as the logo URL caption.
5. THE PrimaryTabs SHALL render one `<a>` element per entry in `primaryNav` in the same index order as defined in `data.ts`.
6. THE SecondaryTabs SHALL render one `<a>` element per entry in `tabNav` in the same index order as defined in `data.ts`.

### Requirement 4: アクティブタブのアクセシビリティ（Active Tab Semantics）

**User Story:** 支援技術を利用するユーザーとして、現在アクティブなタブをスクリーンリーダーで判別したい。そうすれば、自分がどのページにいるかを正しく認識できる。

#### Acceptance Criteria

1. WHEN THE PrimaryTabs renders with `activeIndex = i`, THE PrimaryTabs SHALL assign `aria-current="page"` to exactly the `i` 番目の `<a>` element and SHALL NOT assign `aria-current` to any other `<a>` within PrimaryTabs.
2. WHEN THE SecondaryTabs renders with `activeIndex = i`, THE SecondaryTabs SHALL assign `aria-current="page"` to exactly the `i` 番目の `<a>` element and SHALL NOT assign `aria-current` to any other `<a>` within SecondaryTabs.
3. WHEN THE PrimaryTabs renders with `activeIndex = i`, THE PrimaryTabs SHALL apply the class `ochat-header__primary-tab--active` to exactly the `i` 番目の `<a>` element and SHALL NOT apply it to any other `<a>` within PrimaryTabs.
4. WHEN THE SecondaryTabs renders with `activeIndex = i`, THE SecondaryTabs SHALL apply the class `ochat-header__secondary-tab--active` to exactly the `i` 番目の `<a>` element and SHALL NOT apply it to any other `<a>` within SecondaryTabs.
5. THE Header_Component SHALL pass `activeIndex = 0` to both PrimaryTabs and SecondaryTabs as the initial active tab.
6. THE LogoBlock SHALL provide the accessible name `お気楽チャット トップへ` via `aria-label` on its root `<a>` element.
7. WHERE the翼型アイコン and each ガイドメニューアイコン are rendered, THE Header_Component SHALL mark them as `aria-hidden="true"` so that icon graphics do not duplicate adjacent text for screen readers.
8. THE GuideMenu SHALL render inside a `<nav>` element with accessible name `ガイドメニュー` via `aria-label`.
9. THE PrimaryTabs SHALL render inside a `<nav>` element with accessible name `メインナビゲーション` via `aria-label`.
10. THE SecondaryTabs SHALL render inside a `<nav>` element with accessible name `チャット種別タブ` via `aria-label`.

### Requirement 5: レスポンシブ表示（Responsive Layout）

**User Story:** モバイル端末のユーザーとして、狭い画面でもヘッダー全体の情報にアクセスしたい。そうすれば、端末種別を問わずナビゲーションを利用できる。

#### Acceptance Criteria

1. WHILE the viewport width is at least `768px`, THE `.ochat-header__top` SHALL lay out LogoBlock and GuideMenu horizontally using `display: flex` with `flex-direction: row`.
2. WHILE the viewport width is less than `768px`, THE `.ochat-header__top` SHALL lay out LogoBlock and GuideMenu vertically using `flex-direction: column`.
3. THE `.ochat-header__primary-list` SHALL set `overflow-x: auto` so that all PrimaryTabs items remain reachable via horizontal scrolling when the row exceeds the viewport width.
4. THE `.ochat-header__secondary-list` SHALL set `overflow-x: auto` so that all SecondaryTabs items remain reachable via horizontal scrolling when the row exceeds the viewport width.
5. THE `.ochat-header__primary-list` SHALL use `flex-wrap: nowrap` to keep all PrimaryTabs in a single horizontal row regardless of viewport width.
6. THE `.ochat-header__secondary-list` SHALL use `flex-wrap: nowrap` to keep all SecondaryTabs in a single horizontal row regardless of viewport width.

### Requirement 6: 既存データの再利用（Reuse of Existing Data Sources）

**User Story:** 開発者として、既存の `primaryNav` / `tabNav` / `guideLinks` を変更せず再利用したい。そうすれば、ナビゲーション項目の一元管理を維持できる。

#### Acceptance Criteria

1. THE Header_Component SHALL import `primaryNav`, `tabNav`, and `guideLinks` from `src/features/top/data.ts` without modifying their types or contents.
2. THE Header_Component SHALL import `guideIcons` from `src/features/top/data.ts`.
3. THE `data.ts` module SHALL export a value `guideIcons` typed as `readonly GuideIconKind[]`.
4. THE `data.ts` module SHALL export a type `GuideIconKind` defined as the string literal union `'faq' | 'tutorial' | 'heart' | 'profile' | 'mail'`.
5. THE `guideIcons` array SHALL have the same length as `guideLinks`.
6. WHEN THE GuideMenu renders, THE GuideMenu SHALL pair `guideLinks[i]` as the item label with `guideIcons[i]` as the item's icon kind for every index `i` in range `[0, guideLinks.length)`.
7. IF `guideIcons.length` does not equal `guideLinks.length` at module load time, THEN a unit test SHALL fail with a descriptive error identifying the mismatch.

### Requirement 7: TopPage への統合（Integration with TopPage）

**User Story:** 開発者として、新しい画像不使用ヘッダーを既存 `TopPage` に差し替え統合したい。そうすれば、トップページに画像ロードが一切発生しないヘッダーが表示される。

#### Acceptance Criteria

1. THE TopPage SHALL import the `Header` symbol from `src/features/top/components/header/Header` and render it as the first child of its root container.
2. THE TopPage SHALL NOT define an internal `Header` function component after this change is applied.
3. WHEN THE TopPage renders, THE Rendered_Output of the header region SHALL NOT contain any `<img>` element whose `src` attribute references `okiraku/images/logo.png`, `okiraku/images/head.png`, `okiraku/images/navi.png`, or `okiraku/images/faq.png`.
4. WHEN THE TopPage renders, THE Rendered_Output SHALL contain exactly one `<header>` element with `className` containing `"ochat-header"`.
5. THE TopPage SHALL preserve its existing `useSEO`, `usePageView`, and `useRoomCounts` calls unchanged by this feature.

### Requirement 8: 完全性の検証可能性（Property-Based Verifiability）

**User Story:** 品質保証担当として、ヘッダー実装の正しさをプロパティベーステストで自動検証したい。そうすれば、実装変更時のリグレッションを早期に検出できる。

#### Acceptance Criteria

1. FOR ANY valid `activeIndex` in the range `[0, primaryNav.length)`, THE PrimaryTabs SHALL render exactly one element with class `ochat-header__primary-tab--active` and exactly one element with attribute `aria-current="page"`.
2. FOR ANY valid `activeIndex` in the range `[0, tabNav.length)`, THE SecondaryTabs SHALL render exactly one element with class `ochat-header__secondary-tab--active` and exactly one element with attribute `aria-current="page"`.
3. FOR ANY rendering of THE Header_Component, THE count of elements with class `ochat-header__primary-tab--active` SHALL equal 1, AND THE count of elements with class `ochat-header__secondary-tab--active` SHALL equal 1.
4. FOR ANY rendering of THE Header_Component, THE Rendered_Output SHALL contain every label in `primaryNav` as a substring at least once.
5. FOR ANY rendering of THE Header_Component, THE Rendered_Output SHALL contain every `label` in `tabNav` as a substring at least once.
6. FOR ANY rendering of THE Header_Component, THE Rendered_Output SHALL contain every label in `guideLinks` as a substring at least once.
7. FOR ANY rendering of THE Header_Component, THE Rendered_Output SHALL contain the substring `aria-current="page"` exactly two times (one for PrimaryTabs, one for SecondaryTabs).
8. FOR ANY `kind` in `GuideIconKind`, THE `GuideIcon` component SHALL return a non-null `<svg>` element whose `viewBox` attribute equals `"0 0 16 16"`.
