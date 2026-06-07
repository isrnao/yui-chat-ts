import { useState } from 'react';
import type { RoomId } from '@features/chat/rooms';

export function useReplyTarget() {
  const [replyTarget, setReplyTarget] = useState<RoomId>('all');
  return { replyTarget, setReplyTarget };
}
