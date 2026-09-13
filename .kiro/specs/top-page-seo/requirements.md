# Requirements Document

## Introduction

本ドキュメントは、お気楽チャットのトップページ (`src/features/top/TopPage.tsx`) の SEO 対策を強化する機能 `top-page-seo` の要件を定義する。現状トップページは `useSEO` フック (`src/shared/hooks/useSEO.ts`) で `<title>`, `<meta name="description">`, `<meta name="keywords">`, `<link rel="canonical">`, `<meta property="og:image">` (および `twitter:image`) のみを動的に更新している。一方、Open Graph / Twitter Card メタタグの大半、検索エンジン向け構造化データ（`WebSite`, `BreadcrumbList`, `ItemList`）、視覚的 `<h1>`、`public/sitemap.xml` のチャット部屋網羅、ハードコードされた origin URL、`href="#"` のプレースホルダーリンクなどが欠落・不整合状態にある。

本 spec はこれらを補強し、Google / Bing の検索結果カード表示・SNS シェア時のリンクプレビュー・サイト内ナビゲーション理解を改善する。チャット部屋ページ (`src/App.tsx` 内 `ChatPage`) と Chanari 部屋ページ (`ChanariChatPage`) は本 spec のスコープ外（ただし `useSEO` 拡張は共通機構なので副次的に恩恵を受ける）。

実装が正しいことを自動検証可能にするため、プロパティベーステスト（PBT）および単体テストで検査可能な形式で要件を記述する。

## Glossary

- **TopPage**: `src/features/top/TopPage.tsx` の `export default function TopPage()`。お気楽チャットのトップページを描画するルートコンポーネント。
- **useSEO_Hook**: `src/shared/hooks/useSEO.ts` の `useSEO` 関数。マウント時に `document.head` に SEO メタタグを差し込む副作用フック。
- **UseSEOOptions**: `useSEO` 関数の引数型。本 spec では `og` および `jsonLd` の追加プロパティを許容するよう拡張する。
- **OG_Tags**: Open Graph プロトコルに準拠した `<meta property="og:*">` メタタグ群。`og:title`, `og:description`, `og:type`, `og:url`, `og:image`, `og:site_name`, `og:locale` の 7 種を最低セットとする。
- **Twitter_Card_Tags**: Twitter Card に準拠した `<meta name="twitter:*">` メタタグ群。`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image` の 4 種を最低セットとする。
- **JSON_LD_Block**: `<script type="application/ld+json">` で挿入する schema.org 構造化データ要素。
- **WebSite_LD**: `@type: "WebSite"` の構造化データ。`url`, `name`, `inLanguage`, `potentialAction (SearchAction)` を含む。
- **ItemList_LD**: `@type: "ItemList"` の構造化データ。トップページ上の主要チャット部屋ディレクトリを `itemListElement` で列挙する。
- **Breadcrumb_LD**: `@type: "BreadcrumbList"` の構造化データ。トップページでは 1 段（Home のみ）で表現する。
- **Sitemap**: `public/sitemap.xml`。検索エンジンに公開する URL 一覧。
- **CanonicalURL**: `<link rel="canonical">` の `href`。重複コンテンツ対策のため正規 URL を 1 つに固定する。
- **SiteOrigin**: 本サイトの公開オリジン `https://isrnao.github.io`（GitHub Pages）。`BASE_URL` (`/yui-chat-ts/`) と組み合わせて絶対 URL を構築する。
- **PlaceholderHref**: `href="#"` のみが設定されたアンカー。SEO 上クロールできないリンクとして検出対象とする。
- **OGImageURL**: OG / Twitter Card 用の画像 URL。絶対 URL（`https://` から始まる）で指定する必要がある。
- **Rendered_Head**: `TopPage` のマウント後、`document.head` 配下に存在するメタ要素群。

## Requirements

### Requirement 1: ソーシャルメタタグの完備（Open Graph / Twitter Card）

**User Story:** SNS でトップページを共有するユーザーとして、リンクプレビューにタイトル・説明・代表画像が正しく表示されてほしい。そうすれば、共有先のフォロワーがリンク先の内容を一目で判断できる。

#### Acceptance Criteria

1. WHEN THE TopPage renders, THE Rendered_Head SHALL contain a `<meta property="og:title">` element whose `content` attribute equals the value passed to `useSEO_Hook` as `title`.
2. WHEN THE TopPage renders, THE Rendered_Head SHALL contain a `<meta property="og:description">` element whose `content` attribute equals the value passed to `useSEO_Hook` as `description`.
3. WHEN THE TopPage renders, THE Rendered_Head SHALL contain a `<meta property="og:type">` element whose `content` attribute equals the literal string `"website"`.
4. WHEN THE TopPage renders, THE Rendered_Head SHALL contain a `<meta property="og:url">` element whose `content` attribute equals the value passed to `useSEO_Hook` as `canonical`.
5. WHEN THE TopPage renders, THE Rendered_Head SHALL contain a `<meta property="og:site_name">` element whose `content` attribute equals the literal string `"お気楽チャット"`.
6. WHEN THE TopPage renders, THE Rendered_Head SHALL contain a `<meta property="og:locale">` element whose `content` attribute equals the literal string `"ja_JP"`.
7. WHEN THE TopPage renders, THE Rendered_Head SHALL contain a `<meta property="og:image">` element whose `content` attribute matches the regex `^https?://`（絶対 URL）.
8. WHEN THE TopPage renders, THE Rendered_Head SHALL contain a `<meta name="twitter:card">` element whose `content` attribute equals the literal string `"summary_large_image"`.
9. WHEN THE TopPage renders, THE Rendered_Head SHALL contain a `<meta name="twitter:title">` element whose `content` attribute equals the value passed to `useSEO_Hook` as `title`.
10. WHEN THE TopPage renders, THE Rendered_Head SHALL contain a `<meta name="twitter:description">` element whose `content` attribute equals the value passed to `useSEO_Hook` as `description`.
11. WHEN THE TopPage renders, THE Rendered_Head SHALL contain a `<meta name="twitter:image">` element whose `content` attribute matches the regex `^https?://`.
12. WHILE the same `useSEO_Hook` invocation is re-rendered with identical options, THE Rendered_Head SHALL NOT contain duplicate `<meta property="og:title">` / `<meta property="og:description">` / `<meta property="og:url">` / `<meta property="og:type">` / `<meta property="og:site_name">` / `<meta property="og:locale">` / `<meta name="twitter:card">` / `<meta name="twitter:title">` / `<meta name="twitter:description">` elements (各 1 件のみ存在).

### Requirement 2: 構造化データ（JSON-LD）の追加

**User Story:** 検索エンジンとして、トップページが「サイト全体のホーム」「チャット部屋の集約ディレクトリ」「パンくずナビゲーションの起点」であることを機械可読な形で把握したい。そうすれば、検索結果でサイトリンク・サイト内検索ボックス・パンくず表示を生成できる。

#### Acceptance Criteria

1. WHEN THE TopPage renders, THE Rendered_Head SHALL contain at least one `<script type="application/ld+json">` element whose parsed JSON has `@type` equal to `"WebSite"` (WebSite_LD).
2. THE WebSite_LD SHALL contain `@context` equal to `"https://schema.org"`, `url` equal to the value passed to `useSEO_Hook` as `canonical`, `name` equal to the literal string `"お気楽チャット"`, and `inLanguage` equal to `"ja-JP"`.
3. THE WebSite_LD SHALL contain a `potentialAction` of `@type: "SearchAction"` with `target` を `urlTemplate` 形式で（例: `"{canonical}?q={search_term_string}"`）持ち、`query-input` を `"required name=search_term_string"` とする — ただし、本機能ではサイト内検索 UI を実装しないため、検索 URL は将来予約として固定値 `"{canonical}?q={search_term_string}"` を出力するに留める.
4. WHEN THE TopPage renders, THE Rendered_Head SHALL contain at least one `<script type="application/ld+json">` element whose parsed JSON has `@type` equal to `"BreadcrumbList"` (Breadcrumb_LD).
5. THE Breadcrumb_LD SHALL contain exactly one `itemListElement` entry with `position: 1`, `name: "ホーム"`, and `item` equal to the value passed to `useSEO_Hook` as `canonical`.
6. WHEN THE TopPage renders, THE Rendered_Head SHALL contain at least one `<script type="application/ld+json">` element whose parsed JSON has `@type` equal to `"ItemList"` (ItemList_LD).
7. THE ItemList_LD `itemListElement` array SHALL contain one entry per `RoomLink` rendered in the TopPage's left column (`chatDirectoryGroups`) AND main column pickups (`pickupGroups`), excluding entries whose `href` equals `"#"`.
8. EACH `itemListElement` entry SHALL be of `@type: "ListItem"` with `position` (1-indexed sequential integer), `name` equal to the room's `label`, and `url` equal to the room's absolute URL (`SiteOrigin + RoomLink.href`).
9. WHILE the same TopPage is re-rendered with identical data, THE Rendered_Head SHALL contain exactly one WebSite_LD, exactly one Breadcrumb_LD, and exactly one ItemList_LD (no duplication).
10. IF any JSON_LD_Block fails `JSON.parse`, THEN a property-based test SHALL fail with a descriptive error identifying the malformed block.

### Requirement 3: 見出し階層の正規化（Heading Hierarchy）

**User Story:** 検索エンジンと支援技術として、トップページの主要なトピックを `<h1>` で把握したい。そうすれば、ページの主題を正しくインデックス化できる。

#### Acceptance Criteria

1. WHEN THE TopPage renders, THE rendered DOM SHALL contain exactly one `<h1>` element.
2. THE `<h1>` element SHALL contain the literal string `"お気楽チャット"` as part of its text content.
3. THE `<h1>` element SHALL NOT have the class `sr-only` (i.e. it must be visually rendered).
4. THE `<h1>` element SHALL precede every `<h2>` element in document order within THE TopPage.
5. THE TopPage SHALL NOT contain any `<h2>` whose text duplicates the `<h1>` exactly.
6. EVERY `<h3>` element in THE TopPage SHALL be a descendant of an `<h2>` element's section, ensuring heading levels are not skipped (i.e. there is no `<h3>` outside of any `<h2>`-introduced section).

### Requirement 4: 画像 alt 属性の整備（Image Alternative Text）

**User Story:** スクリーンリーダー利用者と画像検索クローラとして、トップページの画像が装飾か意味伝達かを判別したい。そうすれば、装飾画像をスキップしつつ意味のある画像のみを認識できる。

#### Acceptance Criteria

1. WHEN THE TopPage renders any `<img>` whose `src` matches `/avatars/.+\.gif$`, THE `<img>` element SHALL have an `alt` attribute equal to the avatar's displayed name (i.e. `profiles[i][0]` for the same row index).
2. WHEN THE TopPage renders any `<img>` that is purely decorative (e.g. `okiraku/images/town.gif`, `okiraku/images/rosenmembers_s.jpg`), THE `<img>` element SHALL have `alt=""` AND `role="presentation"` OR `aria-hidden="true"`.
3. THE TopPage SHALL NOT contain any `<img>` element without an `alt` attribute.
4. THE TopPage SHALL NOT contain any `<img>` element whose `alt` attribute equals the literal string `"image"` or `"img"` or other meaningless filler text.

### Requirement 5: sitemap.xml の網羅性（Sitemap Completeness）

**User Story:** 検索エンジンクローラとして、チャットサイト内の全公開 URL を sitemap 1 ファイルから発見したい。そうすれば、トップから辿らずに各部屋ページを直接インデックス対象にできる。

#### Acceptance Criteria

1. THE Sitemap SHALL contain exactly one `<url>` element whose `<loc>` equals `"https://isrnao.github.io/yui-chat-ts/"`.
2. FOR EVERY `roomId` in `CHAT_ROOM_IDS` (`src/features/chat/rooms.ts`), IF the room is enabled (`getRoomMeta(roomId).enabled === true`), THEN THE Sitemap SHALL contain a `<url>` element whose `<loc>` equals `"https://isrnao.github.io" + buildChatRoomPath(roomId)`.
3. FOR EVERY `roomId` rendered as a `chanariRoom` link in `src/features/top/data.ts` (i.e. linked via `buildChanariRoomPath`), THE Sitemap SHALL contain a `<url>` element whose `<loc>` equals `"https://isrnao.github.io" + buildChanariRoomPath(roomId)`.
4. EVERY `<url>` element in THE Sitemap SHALL contain a `<lastmod>` whose value is a valid ISO-8601 date (YYYY-MM-DD) AND is no earlier than `2026-01-01`.
5. THE Sitemap SHALL contain a `<url>` element with `<loc>` equal to `"https://isrnao.github.io/yui-chat-ts/"` having `<priority>1.0</priority>` and `<changefreq>daily</changefreq>`.
6. THE Sitemap SHALL NOT contain any `<url>` whose `<loc>` references a path that returns 404 on the production site (validated by ensuring every `<loc>` corresponds to a path matched by `matchRoute` or `matchChanariRoute`).
7. THE Sitemap SHALL be generated (or validated) by a build-time / test-time script so that drift between `CHAT_ROOM_IDS` and `<url>` entries is detected automatically.

### Requirement 6: Canonical URL の単一出典化（Single Source of Truth）

**User Story:** 開発者として、`SiteOrigin` (`https://isrnao.github.io`) を 5 箇所以上にハードコードした現状を解消し、1 箇所で管理したい。そうすれば、ドメイン変更時の修正漏れを防げる。

#### Acceptance Criteria

1. THE codebase SHALL export a single constant `SITE_ORIGIN` (例: `'https://isrnao.github.io'`) from `src/shared/utils/seo.ts`.
2. THE codebase SHALL export a single function `buildAbsoluteUrl(path: string): string` from `src/shared/utils/seo.ts` that returns `SITE_ORIGIN + path`.
3. EVERY occurrence of the literal `'https://isrnao.github.io'` in `src/**/*.{ts,tsx}` (excluding `src/shared/utils/seo.ts` and test fixtures) SHALL be replaced with a reference to `SITE_ORIGIN` or `buildAbsoluteUrl(...)`.
4. THE TopPage SHALL compute its `canonical` using `buildAbsoluteUrl(import.meta.env.BASE_URL)` so the value updates automatically if `vite.config.ts`'s `base` changes.
5. WHEN `SITE_ORIGIN` is changed in `src/shared/utils/seo.ts`, EVERY canonical URL, OG `og:url`, breadcrumb item URL, and structured-data URL SHALL pick up the new value without further code changes.

### Requirement 7: クロール阻害要因の解消（Crawlable Internal Links）

**User Story:** 検索エンジンクローラとして、TopPage 上のリンクを辿って関連ページを発見したい。そうすれば、ディレクトリ全体を効率的にインデックス化できる。

#### Acceptance Criteria

1. WHEN THE TopPage renders, EVERY `<a>` element with `href="#"` SHALL be flagged by a static test as "non-crawlable placeholder" and SHALL be replaced or annotated within the scope of this spec.
2. WHERE a placeholder link cannot be replaced with a real destination in this spec's scope (例: `RightColumn` の 「つぶやき」「待ち合わせ掲示板」), THE `<a>` element SHALL be converted to a `<span>` or `<button type="button">` so that empty `href` does not pollute the link graph.
3. WHERE a `RoomLink` has `external: true`, THE rendered `<a>` SHALL include `rel="noopener noreferrer"` (already enforced) AND SHALL NOT be included in ItemList_LD's `itemListElement` (Requirement 2.7) because external links should not advertise our internal directory.
4. THE TopPage SHALL NOT contain any `<a>` element whose `href` is an empty string `""`.

### Requirement 8: 既存テストの非破壊（Backward Compatibility）

**User Story:** 開発者として、SEO 強化に伴って既存のテストスイートを壊したくない。そうすれば、安全に変更を統合できる。

#### Acceptance Criteria

1. THE feature SHALL preserve the existing `useSEO` test cases in `src/shared/hooks/useSEO.test.ts` without modification of their expectations (only additions for new options are permitted).
2. THE feature SHALL preserve the existing `defaultSEOMetadata` test cases in `src/shared/utils/seo.test.ts` without modification of their expectations.
3. THE feature SHALL preserve the existing `TopPage` test cases in `src/features/top/TopPage.test.tsx` without modification of their expectations (assertions for new SEO behavior are added in a separate test file).
4. THE feature SHALL NOT change the existing signature of `useSEO(options: UseSEOOptions)`. New options SHALL be added as optional fields on `UseSEOOptions` so that existing call sites continue to compile and behave identically.

### Requirement 9: 自動検証可能性（Property-Based Verifiability）

**User Story:** 品質保証担当として、SEO メタ生成の正しさをプロパティベーステストで自動検証したい。そうすれば、`useSEO` のオプション変更や TopPage の DOM 変更時のリグレッションを早期に検出できる。

#### Acceptance Criteria

1. FOR ANY non-empty string `title` AND non-empty string `description` AND a valid URL `canonical`, WHEN `useSEO({ title, description, canonical })` is invoked on a clean `document.head`, THE resulting `document.head` SHALL contain `<meta property="og:title" content="{title}">`, `<meta property="og:description" content="{description}">`, AND `<meta property="og:url" content="{canonical}">` exactly once each.
2. FOR ANY rendering of the TopPage, THE parsed JSON of every `<script type="application/ld+json">` SHALL successfully parse via `JSON.parse` AND SHALL contain `@context` equal to `"https://schema.org"`.
3. FOR ANY rendering of the TopPage, THE count of `<h1>` elements SHALL equal exactly `1`.
4. FOR ANY rendering of the TopPage, THE count of `<img>` elements without an `alt` attribute SHALL equal `0`.
5. FOR ANY parsed Sitemap content, THE set of `<loc>` values SHALL be a superset of `{ buildAbsoluteUrl(buildChatRoomPath(roomId)) | roomId ∈ enabled CHAT_ROOM_IDS }` ∪ `{ buildAbsoluteUrl(buildChanariRoomPath(roomId)) | roomId ∈ chanari rooms in data.ts }`.
6. FOR ANY invocation of `useSEO` followed by a re-render with identical options, THE count of `<meta property="og:title">` elements SHALL equal `1` (idempotency).
7. FOR ANY rendering of the TopPage, EVERY `<a>` element's `href` SHALL match one of: `^https?://`, `^/yui-chat-ts/`, `^#pickup-`. No `<a href="#">` SHALL remain.

## Out-of-Scope（本 spec で扱わない）

- チャット部屋ページ (`ChatPage`) / Chanari 部屋ページ (`ChanariChatPage`) の SEO（`useSEO_Hook` 拡張の恩恵は受けるが、本 spec の受入基準は適用しない）。
- 多言語対応 (`hreflang`)。本サイトは日本語のみ。
- AMP / PWA / Service Worker。
- `og:image` の動的生成（OG イメージ自動レンダリング）。`/og-image.png` の静的画像で十分とする。
- Robots.txt の変更。現状で十分。
- Google Search Console / Bing Webmaster Tools の登録手順（運用ドキュメントの範疇）。
- 既存 `.okiraku-*` クラスの撤去や `RoomAnchor` の SPA 化（別 spec 推奨）。
