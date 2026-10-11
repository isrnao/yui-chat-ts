/**
 * 規約などの公開するページ（.kiro/specs/android-native-app design.md §7.7、Task 0.4）。Android 版は同意の画面と設定から
 * リンクし、同意した版を端末に残す（contracts の legal.json に書き出す）。
 *
 * 文面は運営が書く。公開するまで TERMS_VERSION は null（Android 版は未公開として扱う）。公開したら、文面を変えるたびに
 * 日付の版（例: '2026-11-01'）にする。版が変わると Android 版は同意を取り直す。
 */
export const TERMS_VERSION: string | null = null;

/** 公開するページのパス（末尾の / まで。GitHub Pages の 301 を避ける） */
export const LEGAL_PAGE_PATHS = {
  terms: '/terms/',
  privacy: '/privacy/',
  safety: '/safety/',
} as const;
