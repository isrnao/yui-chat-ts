import type { RoomCountMap } from '../../api/roomCountsApi';
import { chatDirectoryGroups, type ChatDirectoryGroup } from '../../data';
import { CountBadge } from '../CountBadge';
import { RoomAnchor } from '../RoomAnchor';
import { SectionTitle } from '../SectionTitle';
import { resolveCount } from '../shared/resolveCount';
import { toneClass, toneMarkerClass } from '../shared/tones';

function RoomList({ group, liveCounts }: { group: ChatDirectoryGroup; liveCounts: RoomCountMap }) {
  return (
    <section className="mb-3">
      <h3 className="text-[13px] font-bold leading-tight text-gray-800">{group.title}</h3>
      <p className={`text-[11px] font-bold leading-tight ${toneClass[group.tone]}`}>{group.note}</p>
      <ul className="mt-1 list-outside list-[circle] pl-[14px] text-[12px] leading-[1.3]">
        {group.items.map((item) => (
          <li key={item.label} className={toneMarkerClass[group.tone]}>
            <RoomAnchor item={item} className="font-bold text-blue-600 hover:underline" />
            <CountBadge count={resolveCount(item, liveCounts)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LeftColumn({ liveCounts }: { liveCounts: RoomCountMap }) {
  return (
    <aside className="border-r border-gray-300 bg-white px-2 py-2 max-md:order-1 max-md:border-r-0">
      <SectionTitle>チャット</SectionTitle>
      <div className="pt-3">
        {chatDirectoryGroups.map((group) => (
          <RoomList key={group.title} group={group} liveCounts={liveCounts} />
        ))}
      </div>
    </aside>
  );
}
