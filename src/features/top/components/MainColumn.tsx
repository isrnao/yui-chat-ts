import type { RoomCountMap } from '../api/roomCountsApi';
import { news, pickupGroups, type PickupGroup } from '../data';
import { CountBadge, resolveCount } from './CountBadge';
import { RoomAnchor } from './RoomAnchor';
import { SectionTitle } from './SectionTitle';
import { toneClass, toneMarkerClass } from './tones';

function PickupList({ group, liveCounts }: { group: PickupGroup; liveCounts: RoomCountMap }) {
  return (
    <section className="mb-[5px] break-inside-avoid">
      <h3 id={group.anchorId} className="text-[13px] font-bold leading-tight text-gray-800">
        {group.title}
      </h3>
      <p className={`text-[11px] font-bold leading-tight ${toneClass[group.tone]}`}>{group.note}</p>
      <ul className="mt-1 list-outside list-[circle] pl-[14px] text-[12px] leading-[1.3]">
        {group.items.map((item) => (
          <li key={item.label} className={`whitespace-nowrap ${toneMarkerClass[group.tone]}`}>
            <RoomAnchor item={item} className="font-bold text-blue-600 hover:underline" />
            <CountBadge count={resolveCount(item, liveCounts)} />
          </li>
        ))}
      </ul>
      {group.moreHref && (
        <a className="mt-1 block text-[11px] text-gray-500 hover:underline" href={group.moreHref}>
          ＋ {group.title}について詳しく見る
        </a>
      )}
    </section>
  );
}

export function MainColumn({ liveCounts }: { liveCounts: RoomCountMap }) {
  return (
    <section className="bg-white px-2 py-2 max-md:order-2">
      <SectionTitle>注目のチャット ピックアップ</SectionTitle>
      <section className="px-2 py-3">
        <h3 className="text-[13px] font-bold">チャットの最新情報</h3>
        <ul className="mt-2 list-outside list-[circle] pl-[14px] text-[12px] leading-[1.3] marker:text-pink-500">
          {news.map((item, newsIndex) => (
            <li key={newsIndex} className="text-gray-700">
              {item.parts.map((part, partIndex) =>
                typeof part === 'string' ? (
                  <span key={partIndex}>{part}</span>
                ) : (
                  <a
                    key={partIndex}
                    href={part.linkHref}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    {part.linkLabel}
                  </a>
                )
              )}
            </li>
          ))}
        </ul>
      </section>
      <div className="px-2">
        {pickupGroups.map((group) => (
          <PickupList key={group.title} group={group} liveCounts={liveCounts} />
        ))}
      </div>
      <SectionTitle>応援してくれる方／ご協力者の方へ</SectionTitle>
      <section id="linkguide" className="px-2 py-3">
        <p className="text-[12px] leading-relaxed">
          当サイトを応援してくれる方は、ブログやホームページに以下のタグを設置したり、Twitterでつぶやいてお気楽チャットのご紹介をお願いいたします。
          <br />
          皆様からの暖かいご支援を心からお待ちしております。
        </p>
        <textarea
          readOnly
          rows={3}
          wrap="soft"
          defaultValue={
            '<a href="https://www.okiraku.chat/" target="_blank" rel="noopener noreferrer">お気楽チャット - チャットで友達探し＆仲間作り</a>'
          }
          onClick={(e) => e.currentTarget.select()}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="お気楽チャット紹介リンクのHTMLタグ (クリックで全選択)"
          className="mt-3 w-full resize-y rounded border border-gray-300 bg-gray-50 p-2 font-mono text-[11px] leading-relaxed text-gray-800"
        />
        <p className="mt-3 text-[12px] leading-relaxed">
          Xでつぶやいてお気楽チャットを紹介する場合は、こちらのボタンからどうぞ。
        </p>
        <a
          href={`https://x.com/intent/tweet?text=${encodeURIComponent('お気楽チャットで友達探し＆仲間作り')}&url=${encodeURIComponent('https://www.okiraku.chat/')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 rounded border border-black bg-black px-3 py-1 text-[12px] font-bold text-white hover:bg-gray-800"
        >
          <span aria-hidden="true" className="font-black">
            𝕏
          </span>
          でツイート
        </a>
      </section>
    </section>
  );
}
