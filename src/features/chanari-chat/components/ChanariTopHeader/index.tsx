export type ChanariTopHeaderProps = {
  backHref: string;
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
  helpHref,
  title,
  description,
  sloganLabel,
}: ChanariTopHeaderProps) {
  const backExternal = isExternalHref(backHref);
  const helpExternal = helpHref ? isExternalHref(helpHref) : false;

  return (
    <>
      <div id="chat-topheader">
        <div id="chat-topheader-left">
          <a
            href={backHref}
            {...(backExternal ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
          >
            なりきりチャットにもどる
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
