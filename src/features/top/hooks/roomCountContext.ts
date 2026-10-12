import { createContext } from 'react';
import type { UseRoomCountsState } from './useRoomCounts';
export const RoomCountContext = createContext<UseRoomCountsState | null>(null);
