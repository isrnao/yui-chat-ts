import { afterEach, describe, it, expect, vi } from 'vitest';
import { resolveRouteFollowingRedirects } from '../../routes/resolveRoute';
import { matchTwoShotRoute } from './routing';

describe('matchTwoShotRoute', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('/chat/2shot/ と /chat/2shot はツーショットチャット', () => {
    expect(matchTwoShotRoute('/chat/2shot/')).toEqual({ type: 'two-shot' });
    expect(matchTwoShotRoute('/chat/2shot')).toEqual({ type: 'two-shot' });
  });

  it('/chanari/2shot/ と /chanari/2shot は /chat/2shot/ へリダイレクトする', () => {
    const redirect = { type: 'redirect', to: '/chat/2shot/' };
    expect(matchTwoShotRoute('/chanari/2shot/')).toEqual(redirect);
    expect(matchTwoShotRoute('/chanari/2shot')).toEqual(redirect);
  });

  it('似た別のパスには一致しない（既存のルートに任せる）', () => {
    for (const path of [
      '/',
      '/chat',
      '/chat/2shot/extra',
      '/chat/2shot-other/',
      '/chat/2SHOT/',
      '/chat/superbeginner/',
      '/chanari/2shots',
      '/2shot/',
      '/other/2shot/',
    ]) {
      expect(matchTwoShotRoute(path), path).toBeNull();
    }
  });

  it('BASE_URL をパスの区切りごとに取り除く', () => {
    vi.stubEnv('BASE_URL', '/app/');
    expect(matchTwoShotRoute('/app/chat/2shot/')).toEqual({ type: 'two-shot' });
    expect(matchTwoShotRoute('/app/chanari/2shot')).toEqual({
      type: 'redirect',
      to: '/app/chat/2shot/',
    });
    expect(matchTwoShotRoute('/chat/2shot/')).toBeNull();
    expect(matchTwoShotRoute('/application/chat/2shot/')).toBeNull();
  });
});

describe('resolveRouteFollowingRedirects（ツーショットチャット）', () => {
  it('/chat/2shot/ は通常の部屋ではなくツーショットチャットになる', () => {
    expect(resolveRouteFollowingRedirects('/chat/2shot/')).toEqual({
      route: { type: 'two-shot' },
      finalPathname: '/chat/2shot/',
    });
  });

  it('/chanari/2shot はちゃなりの部屋ではなく /chat/2shot/ のツーショットチャットになる', () => {
    expect(resolveRouteFollowingRedirects('/chanari/2shot')).toEqual({
      route: { type: 'two-shot' },
      finalPathname: '/chat/2shot/',
    });
  });

  it('ほかの部屋はこれまでどおり', () => {
    expect(resolveRouteFollowingRedirects('/chat/superbeginner/').route).toEqual({
      type: 'chat-room',
      roomId: 'superbeginner',
    });
    expect(resolveRouteFollowingRedirects('/chanari/durarara/').route).toEqual({
      type: 'chanari-room',
      roomId: 'durarara',
    });
  });
});
