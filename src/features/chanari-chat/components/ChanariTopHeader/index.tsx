export type ChanariTopHeaderProps = {
  backHref: string;
  /** 戻るリンクの文言。省略時は遷移先が外部 URL かどうかで自動選択する。 */
  backLabel?: string;
  helpHref?: string;
  title: string;
  description: string;
  sloganLabel?: string;
};

/**
 * `href` が現在の origin の外を指しているかを判定する。
 * 相対 URL や同一 origin の絶対 URL は false (= 内部リンク扱い、同タブ遷移) を返す。
 *
 * SSR や window 不在の環境では new URL() の base 解決ができないため、
 * 接頭辞だけで判断するフォールバックを使う。
 */
function isExternalHref(href: string): boolean {
  if (typeof window === 'undefined' || !window.location) {
    return href.startsWith('http://') || href.startsWith('https://');
  }
  try {
    return new URL(href, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export default function ChanariTopHeader({
  backHref,
  backLabel,
  helpHref,
  title,
  description,
  sloganLabel,
}: ChanariTopHeaderProps) {
  const backExternal = isExternalHref(backHref);
  const helpExternal = helpHref ? isExternalHref(helpHref) : false;
  // backHref が in-app トップを指している既定状態では「お気楽チャットトップへ」と表示し、
  // 外部のなりきりサイトに戻すユースケースでは従来の文言を使う。
  const resolvedBackLabel =
    backLabel ?? (backExternal ? 'なりきりチャットにもどる' : 'お気楽チャットトップへ');

  return (
    <>
      <div id="chat-topheader">
        <div id="chat-topheader-left">
          <a
            href={backHref}
            {...(backExternal ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
          >
            {resolvedBackLabel}
          </a>
          {sloganLabel && <span>{sloganLabel}</span>}
        </div>
        {helpHref && (
          <div id="chat-topheader-right">
            <a
              href={helpHref}
              {...(helpExternal ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
            >
              ヘルプ
            </a>
          </div>
        )}
      </div>
      <div id="header">
        <p id="desc">{description}</p>
        <h1 id="ctitle">{title}</h1>
      </div>
    </>
  );
}
