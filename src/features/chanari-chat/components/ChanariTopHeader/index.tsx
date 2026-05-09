export type ChanariTopHeaderProps = {
  backHref: string;
  helpHref: string;
  title: string;
  description: string;
  sloganLabel?: string;
};

export default function ChanariTopHeader({
  backHref,
  helpHref,
  title,
  description,
  sloganLabel,
}: ChanariTopHeaderProps) {
  return (
    <>
      <div id="chat-topheader">
        <div id="chat-topheader-left">
          <a href={backHref} target="_blank" rel="noreferrer noopener">
            なりきりチャットにもどる
          </a>
          {sloganLabel && <span>{sloganLabel}</span>}
        </div>
        <div id="chat-topheader-right">
          <a href={helpHref} target="_blank" rel="noreferrer noopener">
            ヘルプ
          </a>
        </div>
      </div>
      <div id="header">
        <p id="desc">{description}</p>
        <h1 id="ctitle">{title}</h1>
      </div>
    </>
  );
}
