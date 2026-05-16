export type ChanariTopHeaderProps = {
  backHref: string;
  /** 戻るリンクの文言。省略時は遷移先が外部 URL かどうかで自動選択する。 */
  backLabel?: string;
  helpHref?: string;
  title: string;
  description: string;
  sloganLabel?: string;
};

function isExternalHref(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://');
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
