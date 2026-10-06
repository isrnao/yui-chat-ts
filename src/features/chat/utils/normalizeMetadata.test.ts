import { describe, expect, it } from 'vitest';
import { normalizeChatMetadata } from './normalizeMetadata';

describe('normalizeChatMetadata の入退室の構造（Issue #183）', () => {
  it('event と subject を読む', () => {
    expect(
      normalizeChatMetadata({
        version: 1,
        kind: 'admin',
        event: 'exit',
        subject: { name: 'ゆい', color: '#f00' },
      })
    ).toEqual({
      version: 1,
      kind: 'admin',
      event: 'exit',
      subject: { name: 'ゆい', color: '#f00' },
    });
  });

  it('subject の名前が無い・event が知らない値なら、どちらも捨てる', () => {
    expect(
      normalizeChatMetadata({ version: 1, event: 'enter', subject: { color: '#f00' } })
    ).toEqual({
      version: 1,
    });
    expect(
      normalizeChatMetadata({ version: 1, event: 'kick', subject: { name: 'ゆい', color: '#f00' } })
    ).toEqual({ version: 1 });
  });
});
