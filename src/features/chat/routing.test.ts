import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('BASE_URL', '/');

describe('chat routing', () => {
  it('matches a supported room route', async () => {
    const { matchRoute } = await import('./routing');

    expect(matchRoute('/chat/superbeginner')).toEqual({
      type: 'chat-room',
      roomId: 'superbeginner',
    });
  });

  it('末尾の / が付いた部屋の URL も同じ部屋として扱う', async () => {
    const { matchRoute } = await import('./routing');

    expect(matchRoute('/chat/superbeginner/')).toEqual({
      type: 'chat-room',
      roomId: 'superbeginner',
    });
  });

  it('部屋へのパスは末尾の / まで付ける（GitHub Pages の 301 の転送を挟まない）', async () => {
    const { buildChatRoomPath, matchRoute } = await import('./routing');

    expect(buildChatRoomPath('hajime')).toBe('/chat/hajime/');
    expect(matchRoute('/chat')).toEqual({ type: 'redirect', to: '/chat/superbeginner/' });
  });

  it('matches other registered rooms', async () => {
    const { matchRoute } = await import('./routing');

    expect(matchRoute('/chat/hajime')).toEqual({
      type: 'chat-room',
      roomId: 'hajime',
    });
    expect(matchRoute('/chat/ofall')).toEqual({
      type: 'chat-room',
      roomId: 'ofall',
    });
    expect(matchRoute('/chat/area_kantoh')).toEqual({
      type: 'chat-room',
      roomId: 'area_kantoh',
    });
    expect(matchRoute('/chat/hajime-old')).toEqual({
      type: 'chat-room',
      roomId: 'hajime-old',
    });
  });

  it('matches root as the top page', async () => {
    const { matchRoute } = await import('./routing');

    expect(matchRoute('/')).toEqual({ type: 'top' });
  });

  it('rejects unknown rooms', async () => {
    const { matchRoute } = await import('./routing');

    expect(matchRoute('/chat/unknown-room')).toEqual({ type: 'not-found' });
  });
});
