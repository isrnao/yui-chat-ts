import { usePageView, useSEO } from '@shared/hooks/useSEO';
import { buildAbsoluteUrl } from '@shared/utils/seo';
import { Footer } from './components/Footer';
import { Header } from './components/header/Header';
import { LeftColumn } from './components/LeftColumn';
import { MainColumn } from './components/MainColumn';
import { RightColumn } from './components/RightColumn';
import { useRoomCounts } from './hooks/useRoomCounts';

export default function TopPage() {
  useSEO({
    title: 'お気楽チャットTS - 無料で気軽に参加できる目的別チャット',
    description:
      'お気楽チャットは、無料で気軽に参加できるチャットサービスです。初心者、学生、年代別、趣味、ゲーム、アニメ、なりきりなど目的別の部屋で友達探しや仲間作りを楽しめます。',
    keywords: [
      'お気楽チャット',
      'お気楽チャットTS',
      '無料チャット',
      'ブラウザチャット',
      '友達探し',
      '仲間作り',
      '学生チャット',
      'なりきりチャット',
      'アニメチャット',
      'ゲームチャット',
    ],
    canonical: buildAbsoluteUrl('/'),
    ogImage: buildAbsoluteUrl('/ogp.png'),
  });
  usePageView('お気楽チャット トップ');

  const { counts: liveCounts } = useRoomCounts();

  return (
    <div className="min-h-dvh bg-white font-yui text-[12px] text-gray-700">
      <Header />
      <main className="mx-auto max-w-[990px] border-x border-gray-300 bg-white">
        <section className="px-2 py-3">
          <h2 className="text-[13px] font-bold text-blue-700">
            お気楽チャット - チャットで友達探し＆仲間作り
          </h2>
          <p className="mt-1 leading-relaxed">
            このサイトは、2000年代に毎日のように過ごした思い出のチャットを再現した、私的な非公式個人サイトです。
            当時ここで出会った人たちも、今では大人になり、それぞれの人生を歩んでいると思います。
            それでも、ふとした時にあの頃の「お気楽チャット」を思い出し、懐かしい名前を探したり、誰かに一言を残したくなることがあります。
            そんな人たちがもう一度立ち寄れる、思い出の待ち合わせ場所になれば嬉しいです。
            あの頃の雰囲気や、今となっては少し恥ずかしい黒歴史も含めて、懐かしんでもらえたら嬉しいです。
          </p>
        </section>
        <div className="grid grid-cols-1 md:grid-cols-[176px_1fr] lg:grid-cols-[176px_1fr_360px]">
          <LeftColumn liveCounts={liveCounts} />
          <MainColumn liveCounts={liveCounts} />
          <RightColumn />
        </div>
      </main>
      <Footer />
    </div>
  );
}
