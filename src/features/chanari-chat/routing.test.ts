import { describe, it, expect } from 'vitest';
import { matchChanariRoute } from './routing';

describe('matchChanariRoute', () => {
  it('/chanari 以外のパスには null を返す', () => {
    expect(matchChanariRoute('/')).toBeNull();
    expect(matchChanariRoute('/chat/anime')).toBeNull();
  });

  it('/chanari はデフォルト部屋へリダイレクトする', () => {
    expect(matchChanariRoute('/chanari')).toEqual({
      type: 'redirect',
      to: '/chanari/superbeginner',
    });
  });

  it('/chanari/<enabled な部屋> は chanari-room を返す', () => {
    expect(matchChanariRoute('/chanari/gintama')).toEqual({
      type: 'chanari-room',
      roomId: 'gintama',
    });
  });

  it('/chanari/all は集約ビュー /chat/all へリダイレクトする (単一 room 表示の重複ページを生やさない)', () => {
    expect(matchChanariRoute('/chanari/all')).toEqual({ type: 'redirect', to: '/chat/all' });
  });

  it('未知の部屋 ID は null を返す', () => {
    expect(matchChanariRoute('/chanari/no-such-room')).toBeNull();
  });
});
