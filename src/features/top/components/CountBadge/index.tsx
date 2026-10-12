import { countBadgeClass } from '../shared/tones';

export function CountBadge({ count }: { count: number }) {
  return <span className={`ml-1 font-bold ${countBadgeClass(count)}`}>{count}人</span>;
}
