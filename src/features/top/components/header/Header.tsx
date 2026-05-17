import type { ReactNode } from 'react';
import { guideMenu, primaryNav, tabNav } from '../../data';
import type { GuideIconKind } from '../../data';
import { GuideIcon, TsBadge, WingIcon } from './icons';
import './headerTheme.css';

/**
 * お気楽チャットのロゴブロック。翼型アイコン + URL キャプション + 大文字青タイトル。
 *
 * 画像アセットを一切参照せず、インライン SVG + テキスト + CSS のみで描画する。
 * SEO/アクセシビリティのために `<h1>` で見出し構造を維持する。
 */
function LogoBlock() {
  return (
    <h1 className="ochat-header__logo-h1">
      {/*
        h1 / a に二重に accessible name を持たせないため:
          - h1 は visible text ("お気楽チャット") からそのまま name を導出する
            (URL 部分は aria-hidden 済み)
          - a 側も aria-label は付けず、リンク先のヒントは title 属性で補う
       */}
      <a
        className="ochat-header__logo"
        href={import.meta.env.BASE_URL}
        title="お気楽チャットのトップへ"
      >
        <WingIcon className="ochat-header__logo-wing" />
        <span className="ochat-header__logo-texts">
          <span className="ochat-header__logo-url" aria-hidden="true">
            <span className="ochat-header__logo-url-www">www</span>
            <span className="ochat-header__logo-url-dot">.</span>
            <span className="ochat-header__logo-url-mid">okiraku</span>
            <span className="ochat-header__logo-url-dot">.</span>
            <span className="ochat-header__logo-url-com">chat</span>
          </span>
          <span className="ochat-header__logo-title-row">
            <span className="ochat-header__logo-title">お気楽チャット</span>
            <TsBadge className="ochat-header__logo-ts" />
          </span>
        </span>
      </a>
    </h1>
  );
}

type GuideMenuItem = {
  label: string;
  iconKind: GuideIconKind;
  href: string;
};

/**
 * ガイドメニュー。各項目は `<GuideIcon>` + テキストで構成され、
 * アイコンは装飾扱い（`aria-hidden="true"`）。
 */
function GuideMenu({ items }: { items: readonly GuideMenuItem[] }) {
  return (
    <nav aria-label="ガイドメニュー" className="ochat-header__guide">
      <ul className="ochat-header__guide-list">
        {items.map((item) => (
          <li key={item.label} className="ochat-header__guide-item">
            <a className="ochat-header__guide-link" href={item.href}>
              <GuideIcon kind={item.iconKind} className="ochat-header__guide-icon" />
              <span>{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * 1段目（プライマリ）タブ行。白〜薄グレーグラデ背景、アクティブ項目のみ青グラデ + 白文字。
 *
 * 現状は遷移先未定のため `<button type="button">` でプレースホルダー描画する。
 * `activeIndex` は CSS によるビジュアル強調のみで用い、`aria-current` は付与しない
 * (現在地を表すページが存在しないため)。
 */
function PrimaryTabs({ items, activeIndex }: { items: readonly string[]; activeIndex?: number }) {
  return (
    <nav aria-label="メインナビゲーション" className="ochat-header__primary">
      <ul className="ochat-header__primary-list">
        {items.map((label, index) => {
          const isActive = index === activeIndex;
          const className =
            'ochat-header__primary-tab' + (isActive ? ' ochat-header__primary-tab--active' : '');
          return (
            <li key={label} className="ochat-header__primary-item">
              <button type="button" className={className} disabled>
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type SecondaryTabItem = {
  label: string;
  href: string;
};

/**
 * 2段目（セカンダリ）タブ行。水色グラデ背景、アクティブ項目のみ白塗り + 濃色文字。
 */
function SecondaryTabs({
  items,
  activeIndex,
}: {
  items: readonly SecondaryTabItem[];
  activeIndex: number;
}) {
  return (
    <nav aria-label="チャット種別タブ" className="ochat-header__secondary">
      <ul className="ochat-header__secondary-list">
        {items.map((item, index) => {
          const isActive = index === activeIndex;
          const className =
            'ochat-header__secondary-tab' +
            (isActive ? ' ochat-header__secondary-tab--active' : '');
          return (
            <li key={item.label} className="ochat-header__secondary-item">
              <a
                className={className}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * お気楽チャットヘッダーのルート。4 段構成:
 *
 * 1. 上段: ロゴ + ガイドメニュー
 * 2. プライマリタブ (1段目)
 * 3. 濃青の Seam (細帯)
 * 4. セカンダリタブ (2段目)
 *
 * 画像アセットを一切参照しない（インライン SVG のみ）。
 * 配色は `headerTheme.css` の CSS カスタムプロパティで一元管理される。
 */
export function Header(): ReactNode {
  return (
    <header className="ochat-header">
      <div className="ochat-header__top">
        <LogoBlock />
        <GuideMenu items={guideMenu} />
      </div>
      {/* PrimaryTabs は遷移先未定。activeIndex は渡さず、視覚的にも非アクティブで描画する */}
      <PrimaryTabs items={primaryNav} />
      <div className="ochat-header__seam" aria-hidden="true" />
      <SecondaryTabs items={tabNav} activeIndex={0} />
    </header>
  );
}

// テスト用: プロパティベーステストから直接参照する（ランダム activeIndex を与えるため）
export { PrimaryTabs, SecondaryTabs, GuideMenu, LogoBlock };
export type { GuideMenuItem, SecondaryTabItem };
