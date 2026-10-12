import { getSsgPathname } from './resolveRoute';

/** 別ルートのSSGや旧成果物へhydrateせず、createRootで現在の画面を描く。 */
export function canHydrateSsg(container: HTMLElement, pathname: string): boolean {
  const renderedPath = container.dataset.ssgPath;
  if (container.dataset.ssg !== '1' || !renderedPath) return false;
  const current = getSsgPathname(pathname);
  return current !== null && getSsgPathname(renderedPath) === current;
}
