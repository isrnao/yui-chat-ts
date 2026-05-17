export function CountBadge({ count }: { count: number }) {
  const color = count === 0 ? 'text-gray-400' : count >= 4 ? 'text-orange-500' : 'text-emerald-500';
  return <span className={`ml-1 font-bold ${color}`}>{count}人</span>;
}
