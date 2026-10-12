import { describe, expect, it } from 'vitest';
import { canHydrateSsg } from './ssgHydration';
import { getStaticAliases } from './resolveRoute';

function root(path?: string, ssg = '1') {
  const element = document.createElement('div');
  element.dataset.ssg = ssg;
  if (path !== undefined) element.dataset.ssgPath = path;
  return element;
}

describe('描画元ルートによるSSG照合', () => {
  it('静的別名は既知redirectだけ。停止中のChanari 2shotは独立した部屋のまま', () => {
    expect(getStaticAliases()).toEqual([
      { pathname: '/chat/', target: '/chat/superbeginner/' },
      { pathname: '/chanari/', target: '/chanari/superbeginner/' },
      { pathname: '/chanari/all/', target: '/chat/all/' },
    ]);
  });
  it.each([
    ['/', '/'],
    ['/chat/anime/', '/chat/anime'],
    ['/chanari/durarara/', '/chanari/durarara/'],
    ['/chat/superbeginner/', '/chat'],
    ['/chanari/superbeginner/', '/chanari'],
    ['/chat/all/', '/chanari/all'],
    ['/chat/2shot/', '/chat/2shot'],
  ])('%s のHTMLに同じ画面 %s をhydrateできる', (rendered, current) => {
    expect(canHydrateSsg(root(rendered), current)).toBe(true);
  });

  it.each([
    ['/', '/chat/anime/'],
    ['/chat/anime/', '/chat/durarara/'],
    ['/chat/anime/', '/chanari/anime/'],
    ['/missing-one/', '/missing-two/'],
    ['/', '/unknown@example.invalid/'],
    ['/chat/2shot/', '/chanari/2shot/'],
  ])('%s のHTMLに別画面 %s をhydrateしない', (rendered, current) => {
    expect(canHydrateSsg(root(rendered), current)).toBe(false);
  });

  it('旧SSG、空マーカー、SSGでないHTMLはcreateRootへ渡す', () => {
    expect(canHydrateSsg(root(), '/')).toBe(false);
    expect(canHydrateSsg(root(''), '/')).toBe(false);
    expect(canHydrateSsg(root('/', '0'), '/')).toBe(false);
  });
});
