import type { SVGProps } from 'react';
import type { GuideIconKind } from '../../data';

export type { GuideIconKind };

type WingIconProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & {
  /** アイコンの論理サイズ。既定 42 で `.ochat-header__logo-wing` と同値。 */
  size?: number;
};

/**
 * お気楽チャットロゴ左側の翼アイコン。ユーザー提供の SVG をベースに、
 * 色だけ CSS カスタムプロパティへ差し替えた実装。
 *
 * - 外部 SVG ファイルを参照せず、インライン SVG として描画する。
 * - `fill` / `stroke` は CSS カスタムプロパティ `--ochat-h-logo-wing` / `--ochat-h-logo-wing-fill` を参照。
 * - 装飾扱いのため `aria-hidden="true"` を常に付与する。
 */
export function WingIcon({ size = 38, className, ...rest }: WingIconProps) {
  return (
    <svg
      viewBox="0 0 320 260"
      width={size}
      height={(size * 260) / 320}
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <defs>
        <filter id="ochat-wing-soft-blur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>
      <g filter="url(#ochat-wing-soft-blur)">
        {/* やわらかい塗り */}
        <path
          d="M58 86C42 52, 48 24, 88 34C119 42, 157 43, 203 42C251 41, 291 54, 307 89C320 117, 315 152, 294 175C274 198, 242 208, 210 206C176 203, 142 188, 113 166C88 147, 68 120, 58 86Z"
          fill="var(--ochat-h-logo-wing-fill)"
          opacity="0.9"
        />
        {/* 外周の線 */}
        <path
          d="M60 86C38 50, 46 20, 88 34C116 43, 153 45, 201 43C249 42, 291 53, 308 89C321 116, 318 151, 298 176C278 201, 244 213, 209 211C182 209, 157 198, 133 184C110 171, 89 157, 72 138C59 123, 54 102, 60 86"
          fill="none"
          stroke="var(--ochat-h-logo-wing)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 下側のふくらみ */}
        <path
          d="M72 138C89 156, 111 172, 136 186C160 199, 186 208, 210 211"
          fill="none"
          stroke="var(--ochat-h-logo-wing)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 内側の羽根ライン */}
        <path
          d="M63 92 C80 102, 101 109, 121 115"
          fill="none"
          stroke="var(--ochat-h-logo-wing)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M66 121 C85 130, 106 137, 127 140"
          fill="none"
          stroke="var(--ochat-h-logo-wing)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M76 149 C94 157, 113 161, 132 162"
          fill="none"
          stroke="var(--ochat-h-logo-wing)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 右下の渦 */}
        <path
          d="M205 160C221 145, 248 145, 263 160C279 176, 278 204, 258 216C239 227, 214 219, 207 199C201 181, 211 165, 227 162C240 160, 251 169, 252 181C253 194, 244 203, 234 203"
          fill="none"
          stroke="var(--ochat-h-logo-wing)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

type GuideIconProps = {
  kind: GuideIconKind;
  className?: string;
};

/**
 * `GuideIconKind` 判別ユニオンに対応する簡略シルエット SVG を返すディスパッチ関数。
 *
 * - 全アイコン共通で `viewBox="0 0 16 16"` / `width={14}` / `height={14}` / `aria-hidden="true"` を付与。
 * - `fill` は CSS カスタムプロパティ `--ochat-h-guide-icon-*` を参照（ハードコード色値を含めない）。
 * - switch 末尾の `never` チェックで、将来 `GuideIconKind` が増えたときにコンパイルエラーになる。
 */
export function GuideIcon({ kind, className }: GuideIconProps) {
  const commonProps = {
    viewBox: '0 0 16 16',
    width: 14,
    height: 14,
    'aria-hidden': true,
    className,
  } as const;

  switch (kind) {
    case 'faq':
      return (
        <svg {...commonProps}>
          <path
            d="M3 2 H13 A1 1 0 0 1 14 3 V10 A1 1 0 0 1 13 11 H9 L6 14 V11 H3 A1 1 0 0 1 2 10 V3 A1 1 0 0 1 3 2 Z"
            fill="var(--ochat-h-guide-icon-pink)"
          />
          <text x="8" y="9" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ffffff">
            ?
          </text>
        </svg>
      );
    case 'tutorial':
      return (
        <svg {...commonProps}>
          <rect x="2" y="2" width="12" height="12" rx="1" fill="var(--ochat-h-guide-icon-orange)" />
          <rect x="4" y="5" width="8" height="1" fill="#ffffff" />
          <rect x="4" y="7.5" width="8" height="1" fill="#ffffff" />
          <rect x="4" y="10" width="5" height="1" fill="#ffffff" />
        </svg>
      );
    case 'heart':
      return (
        <svg {...commonProps}>
          <path
            d="M8 14 C 3 10, 1 7, 3 4 C 5 2, 7 3, 8 5 C 9 3, 11 2, 13 4 C 15 7, 13 10, 8 14 Z"
            fill="var(--ochat-h-guide-icon-pink)"
          />
        </svg>
      );
    case 'profile':
      return (
        <svg {...commonProps}>
          <circle cx="8" cy="5.5" r="2.6" fill="var(--ochat-h-guide-icon-green)" />
          <path
            d="M2.5 14 C 3.5 10.5, 6 9.5, 8 9.5 C 10 9.5, 12.5 10.5, 13.5 14 Z"
            fill="var(--ochat-h-guide-icon-green)"
          />
        </svg>
      );
    case 'mail':
      return (
        <svg {...commonProps}>
          <rect
            x="1.5"
            y="3.5"
            width="13"
            height="9"
            rx="1"
            fill="var(--ochat-h-guide-icon-blue)"
          />
          <path d="M1.5 4 L8 9 L14.5 4" stroke="#ffffff" strokeWidth="1" fill="none" />
        </svg>
      );
    default: {
      // 網羅性チェック: 新しい GuideIconKind が追加されたらコンパイルエラーで検出される
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
