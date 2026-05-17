import type { RoomLink } from '../../data';

function isExternalLink(item: RoomLink): boolean {
  if (item.external === false) return false;
  if (item.external === true) return true;
  // 未指定のときは href から判定 (http(s):// を外部扱い、/ や # は内部扱い)
  return /^https?:\/\//.test(item.href);
}

export function RoomAnchor({ item, className }: { item: RoomLink; className: string }) {
  const external = isExternalLink(item);
  return (
    <a
      className={className}
      href={item.href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {item.label}
    </a>
  );
}
