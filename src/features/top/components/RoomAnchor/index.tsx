import { getRoomMeta } from '@features/chat/rooms';
import { trackEvent } from '@shared/utils/analytics';
import type { RoomLink } from '../../data';

function isExternalLink(item: RoomLink): boolean {
  if (item.external === false) return false;
  if (item.external === true) return true;
  // 未指定のときは href から判定 (http(s):// を外部扱い、/ や # は内部扱い)
  return /^https?:\/\//.test(item.href);
}

export function RoomAnchor({ item, className }: { item: RoomLink; className: string }) {
  const external = isExternalLink(item);

  const handleClick = () => {
    if (!item.roomId) return;
    const room = getRoomMeta(item.roomId);
    trackEvent('room_selected', {
      room_id: item.roomId,
      room_title: room.title,
      room_type: item.roomType ?? 'chat',
      transport_type: 'beacon',
    });
  };

  return (
    <a
      className={className}
      href={item.href}
      onClick={handleClick}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {item.label}
    </a>
  );
}
