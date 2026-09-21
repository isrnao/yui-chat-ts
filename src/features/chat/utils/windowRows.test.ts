import { describe, it, expect } from 'vitest';
import {
  getWindowRowOptions,
  DEFAULT_WINDOW_ROW_OPTIONS,
  EXTENDED_WINDOW_ROW_OPTIONS,
} from './windowRows';
import { DEFAULT_ROOM_ID } from '@features/chat/rooms';

describe('getWindowRowOptions', () => {
  it('管理者チャットは 1000 件まで選べる', () => {
    expect(getWindowRowOptions('com_sb')).toBe(EXTENDED_WINDOW_ROW_OPTIONS);
    expect(getWindowRowOptions('com_sb')).toContain(1000);
  });

  it('全部屋まとめは 1000 件まで選べる', () => {
    expect(getWindowRowOptions('all')).toContain(1000);
  });

  it('それ以外の部屋は従来どおり 100 件まで', () => {
    expect(getWindowRowOptions(DEFAULT_ROOM_ID)).toBe(DEFAULT_WINDOW_ROW_OPTIONS);
    expect(Math.max(...getWindowRowOptions(DEFAULT_ROOM_ID))).toBe(100);
  });
});
