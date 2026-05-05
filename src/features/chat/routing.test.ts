import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('BASE_URL', '/yui-chat-ts/');

describe('chat routing', () => {
  it('matches a supported room route', async () => {
    const { matchRoute } = await import('./routing');

    expect(matchRoute('/yui-chat-ts/chat/superbeginner')).toEqual({
      type: 'chat-room',
      roomId: 'superbeginner',
    });
  });

  it('matches root as the top page', async () => {
    const { matchRoute } = await import('./routing');

    expect(matchRoute('/yui-chat-ts/')).toEqual({ type: 'top' });
  });

  it('rejects unsupported rooms', async () => {
    const { matchRoute } = await import('./routing');

    expect(matchRoute('/yui-chat-ts/chat/hajime')).toEqual({ type: 'not-found' });
  });
});
